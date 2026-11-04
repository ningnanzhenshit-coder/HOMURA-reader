/* ============================================================================
   HOMURA · MOBI（PalmDOC / PDB）解析
   ----------------------------------------------------------------------------
   纯前端解析 Kindle MOBI6 容器：
     · PDB 记录表 → 文本记录
     · PalmDOC LZ77 与 Huffman/CDIC 解压
     · MOBI 头 + EXTH 元数据（书名、封面、图片记录）
     · 按 <mbp:pagebreak> 切章，正文做白名单净化后交给小说渲染管道
   不支持：DRM 加密文件、仅包含 KF8 的文件。
   ========================================================================== */

import { createHuffDecoder } from './mobiHuff.js';

import { sanitizeBookBody } from './sanitize.js';
import { isSafeImageUrl } from './utils.js';

const TAG_HEADINGS = 'h1,h2,h3,h4,h5,h6,font,p,div,td,th';

export class MobiError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'MobiError';
    this.code = code;
  }
}

function readU16(buf, offset) {
  return buf[offset] * 256 + buf[offset + 1];
}

function readU32(buf, offset) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

// ---- PalmDOC LZ77 解压：输出恰好 limit 字节，尾部记录附加数据直接忽略 ----

function decompressPalmDoc(src, limit) {
  const out = new Uint8Array(limit);
  let i = 0;
  let o = 0;
  const end = src.length;
  while (i < end && o < limit) {
    const c = src[i++];
    if (c >= 1 && c <= 8) {
      // 连续 c 个原文字节
      for (let k = 0; k < c && i < end && o < limit; k++) out[o++] = src[i++];
    } else if (c <= 0x7f) {
      // 单字节原文（含 0x00）
      out[o++] = c;
    } else if (c <= 0xbf) {
      // 两字节回溯：11 位距离 + 3 位长度
      const c2 = src[i++];
      const packed = (c << 8) | c2;
      const distance = (packed >> 3) & 0x07ff;
      const length = (packed & 0x07) + 3;
      if (distance === 0) continue;
      for (let k = 0; k < length && o < limit; k++) {
        out[o] = out[o - distance];
        o++;
      }
    } else {
      // 0xC0-0xFF：空格 + 字符的快捷编码
      if (o < limit) out[o++] = 0x20;
      if (o < limit) out[o++] = c ^ 0x80;
    }
  }
  return out.subarray(0, o);
}

// ---- PDB 记录表 ----

function readPdbRecords(buf) {
  const count = readU16(buf, 76);
  const tableEnd = 78 + count * 8;
  if (count < 2 || tableEnd > buf.length) throw new MobiError('BAD_FILE', 'MOBI 文件记录表不完整');
  const starts = new Array(count + 1);
  let previous = tableEnd;
  for (let i = 0; i < count; i++) {
    const offset = readU32(buf, 78 + i * 8);
    if (offset < previous || offset > buf.length) throw new MobiError('BAD_FILE', 'MOBI 记录位置无效');
    starts[i] = previous = offset;
  }
  starts[count] = buf.length;
  return starts;
}

// 每条正文记录末尾可带反向变长项和 UTF-8 跨记录字节；它们不属于压缩数据。
function stripRecordTrailer(bytes, flags) {
  let end = bytes.length;
  for (let extra = flags >>> 1; extra; extra >>>= 1) {
    if (!(extra & 1)) continue;
    let length = 0;
    let used = 0;
    let terminated = false;
    while (used < 4 && used < end) {
      const byte = bytes[end - 1 - used];
      length |= (byte & 127) << (7 * used++);
      if (byte & 128) {
        terminated = true;
        break;
      }
    }
    if (!terminated || length < used || length > end) throw new MobiError('BAD_FILE', 'MOBI 正文记录尾部无效');
    end -= length;
  }
  if (flags & 1) {
    const length = (bytes[end - 1] & 3) + 1;
    if (length > end) throw new MobiError('BAD_FILE', 'MOBI 正文记录尾部无效');
    end -= length;
  }
  return bytes.subarray(0, end);
}

// ---- 图片：按魔数判断 MIME，不信任扩展名 ----

function imageMime(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return null;
}

// ---- EXTH 元数据 ----

function readExth(buf, rec0, mobiLength) {
  const base = rec0 + 16 + mobiLength;
  if (String.fromCharCode(buf[base], buf[base + 1], buf[base + 2], buf[base + 3]) !== 'EXTH') {
    return {};
  }
  const exthLength = readU32(buf, base + 4);
  const count = readU32(buf, base + 8);
  const result = {};
  let p = base + 12;
  const limit = Math.min(base + exthLength, buf.length);
  for (let i = 0; i < count && p + 8 <= limit; i++) {
    const id = readU32(buf, p);
    const len = readU32(buf, p + 4);
    if (len < 8 || p + len > limit) break;
    if (id === 201) result.coverOffset = readU32(buf, p + 8);
    if (id === 503) result.title = decodeText(buf.subarray(p + 8, p + len), 'utf-8');
    p += len;
  }
  return result;
}

function decodeText(bytes, encoding) {
  try {
    return new TextDecoder(encoding).decode(bytes).replace(/\0+$/, '').trim();
  } catch (err) {
    return '';
  }
}

// ---- 正文净化 + 图片 recindex 解引用 ----

function sanitizeInto(dom, imageUrlFor) {
  sanitizeBookBody(dom.body, image => {
    const recindex = Number(image.getAttribute('recindex'));
    if (Number.isInteger(recindex) && recindex > 0) return imageUrlFor(recindex);
    const url = image.getAttribute('src') || '';
    return url.startsWith('data:') && isSafeImageUrl(url) ? url : null;
  });
}

// ---- 章节标题：取首个短标题块，否则退化为书号 ----

function pickChapterTitle(body, fallbackTitle, index) {
  const nodes = body.querySelectorAll(TAG_HEADINGS);
  for (let i = 0; i < Math.min(nodes.length, 4); i++) {
    const text = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
    if (text && text.length <= 60 && /[\u4e00-\u9fa5a-zA-Z]/.test(text)) return text;
  }
  return index === 0 ? '开始' : `${fallbackTitle} ${index + 1}`;
}

// ---- 主入口：ArrayBuffer → 书籍数据 ----

export function parseMobiBuffer(arrayBuffer, fallbackTitle = 'MOBI') {
  const buf = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  const container = String.fromCharCode(...buf.subarray(60, 68));
  if (buf.length < 90 || (container !== 'BOOKMOBI' && container !== 'TEXtREAd')) {
    throw new MobiError('BAD_FILE', '文件损坏或不是 MOBI 格式');
  }

  const starts = readPdbRecords(buf);
  const rec0 = starts[0];
  const headerEnd = starts[1];
  if (headerEnd - rec0 < 20) throw new MobiError('BAD_FILE', 'MOBI 文件头不完整');

  const compression = readU16(buf, rec0);
  const textLength = readU32(buf, rec0 + 4);
  const textRecordCount = readU16(buf, rec0 + 8);
  const recordSize = readU16(buf, rec0 + 10) || 4096;
  const encryption = readU16(buf, rec0 + 12);

  // DRM v1 可能连 MOBI 魔数一起加密，先检查 PalmDOC 加密标志。
  if (encryption !== 0) {
    throw new MobiError('DRM', '文件带有 DRM 加密，HOMURA 无法读取。');
  }
  if (container !== 'BOOKMOBI' || String.fromCharCode(...buf.subarray(rec0 + 16, rec0 + 20)) !== 'MOBI') {
    throw new MobiError('BAD_FILE', '文件损坏或不是 MOBI 格式');
  }
  const mobiLength = readU32(buf, rec0 + 20);
  if (mobiLength < 96 || rec0 + 16 + mobiLength > headerEnd
    || !textLength || !textRecordCount || textRecordCount >= starts.length - 1) {
    throw new MobiError('BAD_FILE', 'MOBI 文件头或正文记录不完整');
  }
  if (readU32(buf, rec0 + 36) >= 8) {
    throw new MobiError('KF8', '文件使用 KF8 版式，请导入无 DRM 的 MOBI 或 EPUB。');
  }
  if (compression !== 1 && compression !== 2 && compression !== 17480) {
    throw new MobiError('COMPRESSION', '不支持此 MOBI 文件的压缩方式。');
  }
  const trailerFlags = mobiLength >= 228 ? readU16(buf, rec0 + 242) : 0;
  let decompressHuff;
  if (compression === 17480) {
    const first = readU32(buf, rec0 + 112);
    const count = readU32(buf, rec0 + 116);
    if (mobiLength < 104 || first <= textRecordCount || count < 2 || first + count >= starts.length) {
      throw new MobiError('BAD_FILE', 'MOBI 的 Huffman 字典记录不完整');
    }
    const records = starts.slice(first, first + count).map((start, i) => buf.subarray(start, starts[first + i + 1]));
    try {
      decompressHuff = createHuffDecoder(records);
    } catch (err) {
      throw new MobiError('BAD_FILE', 'MOBI 的 Huffman 字典损坏', { cause: err });
    }
  }

  const textEncodingRaw = readU32(buf, rec0 + 28);
  const encoding = textEncodingRaw === 65001 ? 'utf-8' : 'windows-1252';
  const firstImage = readU32(buf, rec0 + 0x6c);
  const fullNameOffset = readU32(buf, rec0 + 0x54);
  const fullNameLength = readU32(buf, rec0 + 0x58);
  const exth = readExth(buf, rec0, mobiLength);
  const headerTitle = fullNameLength > 0 && fullNameOffset > 0
    ? decodeText(buf.subarray(rec0 + fullNameOffset, rec0 + fullNameOffset + fullNameLength), encoding)
    : '';

  // 文本记录
  const chunks = [];
  let produced = 0;
  for (let r = 0; r < textRecordCount; r++) {
    const want = Math.min(recordSize, textLength - produced);
    if (want <= 0) break;
    const record = stripRecordTrailer(buf.subarray(starts[r + 1], starts[r + 2]), trailerFlags);
    let out;
    if (compression === 1) out = record.subarray(0, want);
    else if (compression === 2) out = decompressPalmDoc(record, want);
    else {
      try {
        out = decompressHuff(record, want);
      } catch (err) {
        throw new MobiError('BAD_FILE', 'MOBI 的 Huffman 正文记录损坏', { cause: err });
      }
    }
    chunks.push(out);
    produced += out.length;
  }
  if (produced !== textLength) throw new MobiError('BAD_FILE', 'MOBI 正文记录不完整');

  const rawText = decodeText(mergeChunks(chunks), encoding);
  if (!rawText) throw new MobiError('BAD_FILE', 'MOBI 正文解码失败');

  // 图片记录（惰性解码，只在正文真正引用时才建 blob URL）
  const imgRecords = new Map();
  const imageUrlFor = recindex => {
    const recordIndex = firstImage + recindex - 1;
    const cached = imgRecords.get(recordIndex);
    if (cached) return cached.url;
    if (recordIndex < 0 || recordIndex + 1 >= starts.length) return null;
    const from = starts[recordIndex];
    const to = starts[recordIndex + 1] || buf.length;
    const bytes = buf.subarray(from, to);
    const mime = imageMime(bytes);
    if (!mime) return null;
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    imgRecords.set(recordIndex, { url, mime });
    return url;
  };

  // 封面
  let coverBlob = null;
  const coverIndex = Number.isInteger(exth.coverOffset)
    ? firstImage + exth.coverOffset
    : firstImage;
  if (coverIndex > 0 && coverIndex + 1 <= starts.length) {
    const from = starts[coverIndex];
    const to = starts[coverIndex + 1] || buf.length;
    const bytes = buf.subarray(from, to);
    const mime = imageMime(bytes);
    if (mime) coverBlob = new Blob([bytes], { type: mime });
  }

  const title = (exth.title || '').trim() || headerTitle || fallbackTitle;
  const chapters = splitChapters(rawText, title, imageUrlFor);

  return { title, chapters, coverBlob, compression, encoding, resourceUrls: Array.from(imgRecords.values(), image => image.url) };
}

function mergeChunks(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

function splitChapters(rawText, bookTitle, imageUrlFor) {
  // 去掉 <head>/<guide> 引导信息，只留正文
  const cleaned = rawText
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<guide[\s\S]*?<\/guide>/gi, '');

  let parts = cleaned.split(/<mbp:pagebreak\s*\/?>/i).filter(p => p && p.trim());
  if (parts.length === 1) {
    // 没有分页标记的书：退化为按标题标签切分
    parts = cleaned.split(/(?=<h[1-3][\s>])/i).filter(p => p && p.trim());
  }

  const parser = new DOMParser();
  const chapters = [];
  parts.forEach((part, index) => {
    const doc = parser.parseFromString(part, 'text/html');
    if (!doc.body) return;
    sanitizeInto(doc, imageUrlFor);
    const html = (doc.body.innerHTML || '').trim();
    if (!html || (!doc.body.textContent.trim() && !doc.body.querySelector('img'))) return;
    chapters.push({
      title: pickChapterTitle(doc.body, bookTitle, index),
      htmlContent: html
    });
  });

  if (chapters.length === 0) {
    const doc = parser.parseFromString(cleaned, 'text/html');
    sanitizeInto(doc, imageUrlFor);
    chapters.push({
      title: bookTitle,
      htmlContent: (doc.body && doc.body.innerHTML) || '<p>（无法解析该 MOBI 的正文）</p>'
    });
  }
  return chapters;
}
