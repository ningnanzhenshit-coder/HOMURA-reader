/* ============================================================================
   HOMURA · MOBI（PalmDOC / PDB）解析
   ----------------------------------------------------------------------------
   纯前端解析 Kindle MOBI6 容器：
     · PDB 记录表 → 文本记录
     · PalmDOC LZ77 解压（压缩方式 1/2）
     · MOBI 头 + EXTH 元数据（书名、封面、图片记录）
     · 按 <mbp:pagebreak> 切章，净化正文并为纯图片作品提取漫画页
   不支持：DRM 加密文件、Huffman 压缩（方式 17480）、AZW3/KF8 双头格式。
   ========================================================================== */

import { isSafeImageUrl } from './utils.js';
import { sanitizeElement } from './sanitize.js';

const TAG_HEADINGS = 'h1,h2,h3,h4,h5,h6,font,p,div,td,th';

// recindex 解引用得到的是 blob: URL，会被白名单净化器的 isSafeImageUrl 判为不安全。
// 所以净化前先换成无协议占位串，净化通过后再写回真实 blob: URL。
const REC_PLACEHOLDER = /^__homura_rec_(\d+)__$/;

class MobiError extends Error {
  constructor(code, message) {
    super(message);
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
  if (count <= 0) throw new MobiError('BAD_FILE', 'MOBI 文件记录表为空');
  const starts = new Array(count + 1);
  for (let i = 0; i < count; i++) starts[i] = readU32(buf, 78 + i * 8);
  starts[count] = buf.length;
  return starts;
}

// ---- 图片：按魔数判断 MIME，不信任扩展名 ----

function imageMime(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  return null;
}

function imageDimensions(bytes, mime) {
  if (mime === 'image/png' && bytes.length >= 24) {
    return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
  }
  if (mime === 'image/gif' && bytes.length >= 10) {
    return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
  }
  if (mime !== 'image/jpeg') return null;
  let marker = 2;
  while (marker + 8 < bytes.length && bytes[marker] === 0xff) {
    const code = bytes[marker + 1];
    if (code === 0xff) { marker++; continue; }
    if (code === 0xda || code === 0xd9) break;
    const length = readU16(bytes, marker + 2);
    if (length < 2 || marker + 2 + length > bytes.length) break;
    if (code >= 0xc0 && code <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(code) && length >= 8) {
      return { width: readU16(bytes, marker + 7), height: readU16(bytes, marker + 5) };
    }
    marker += 2 + length;
  }
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

// 净化前的 MOBI 专有预处理：占位 recindex，并拆掉没有跳转目标的 filepos 锚点。
function prepareMobiBody(body) {
  for (const node of body.querySelectorAll('*')) {
    if (!node.isConnected) continue;
    const tag = node.tagName.toLowerCase();
    if (tag === 'img') {
      const recindex = parseInt(node.getAttribute('recindex') || '', 10);
      node.removeAttribute('recindex');
      if (Number.isInteger(recindex) && recindex > 0) {
        node.setAttribute('src', `__homura_rec_${recindex}__`);
      }
    } else if (tag === 'a' && !node.getAttribute('href')) {
      // MOBI 内部 filepos 锚点没有可跳转目标，拆掉避免渲染成彩色假链接
      node.replaceWith(...Array.from(node.childNodes));
    }
  }
}

// 净化后的 MOBI 专有后处理：占位串换成 blob URL，其余图片只保留内嵌位图。
// 远程 http(s) 图片在此被丢弃——书内 HTML 不该在打开书籍时偷偷发起外部请求。
function resolveMobiImages(body, imageUrlFor) {
  for (const img of body.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    const recindex = src.match(REC_PLACEHOLDER)?.[1];
    const url = recindex
      ? imageUrlFor(Number(recindex))
      : (/^data:image\//i.test(src) && isSafeImageUrl(src) ? src : null);
    if (url) img.setAttribute('src', url);
    else img.remove();
  }
}

function sanitizeMobiBody(doc, imageUrlFor) {
  if (!doc.body) return;
  prepareMobiBody(doc.body);
  sanitizeElement(doc.body);
  resolveMobiImages(doc.body, imageUrlFor);
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
  if (buf.length < 90) throw new MobiError('BAD_FILE', '文件过小，不是有效的 MOBI');

  const starts = readPdbRecords(buf);
  const rec0 = starts[0];

  const compression = readU16(buf, rec0);
  const textLength = readU32(buf, rec0 + 4);
  const textRecordCount = readU16(buf, rec0 + 8);
  const recordSize = readU16(buf, rec0 + 10) || 4096;
  const encryption = readU16(buf, rec0 + 12);

  if (String.fromCharCode(buf[rec0 + 16], buf[rec0 + 17], buf[rec0 + 18], buf[rec0 + 19]) !== 'MOBI') {
    throw new MobiError('BAD_FILE', '不是 MOBI 格式（可能为 AZW3/KF8 或 EPUB）');
  }
  if (encryption !== 0) {
    throw new MobiError('DRM', '该 MOBI 带有 DRM 加密，暂不支持打开');
  }
  if (compression !== 1 && compression !== 2) {
    throw new MobiError('COMPRESSION', '该 MOBI 使用 Huffman 压缩，暂不支持');
  }

  const mobiLength = readU32(buf, rec0 + 20);
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
    const from = starts[r + 1];
    const to = starts[r + 2] || buf.length;
    if (from == null || from >= buf.length) break;
    const want = Math.min(recordSize, textLength - produced);
    if (want <= 0) break;
    const out = compression === 1
      ? buf.subarray(from, Math.min(to, from + want))
      : decompressPalmDoc(buf.subarray(from, to), want);
    chunks.push(out);
    produced += out.length;
  }
  if (produced === 0) throw new MobiError('BAD_FILE', 'MOBI 正文为空');

  const rawText = decodeText(mergeChunks(chunks), encoding);
  if (!rawText) throw new MobiError('BAD_FILE', 'MOBI 正文解码失败');

  // 图片记录（惰性解码，只在正文真正引用时才建 blob URL）
  const imgRecords = new Map();
  const pageSizes = new Map();
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
    const dimensions = imageDimensions(bytes, mime);
    if (dimensions?.width && dimensions.height) pageSizes.set(url, dimensions);
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
  const { chapters, pageItems } = splitChapters(rawText, title, imageUrlFor);

  return {
    title, chapters, coverBlob, compression, encoding,
    pageItems: pageItems?.map(page => ({ ...page, ...pageSizes.get(page.url) })) ?? null,
    resourceUrls: Array.from(imgRecords.values(), image => image.url)
  };
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
  const imagePages = [];
  let pictureSections = 0;
  let appendixText = 0;
  let allPicturesLocal = true;
  parts.forEach((part, index) => {
    const doc = parser.parseFromString(part, 'text/html');
    if (!doc.body) return;
    sanitizeMobiBody(doc, imageUrlFor);
    const html = (doc.body.innerHTML || '').trim();
    const textLength = doc.body.textContent.replace(/[\s\u200b]/gu, '').length;
    const images = [...doc.body.querySelectorAll('img[src]')];
    if (!html || (!textLength && !images.length)) return;
    const title = pickChapterTitle(doc.body, bookTitle, index);
    if (!textLength && images.length && !doc.body.querySelector('svg, math, table')) {
      pictureSections++;
      for (const { src: url } of images) {
        if (!url.startsWith('blob:') && !(url.startsWith('data:') && isSafeImageUrl(url))) allPicturesLocal = false;
        imagePages.push({ url });
      }
    } else {
      appendixText += textLength;
      imagePages.push({ html, title });
    }
    chapters.push({ title, htmlContent: html });
  });

  if (chapters.length === 0) {
    const doc = parser.parseFromString(cleaned, 'text/html');
    sanitizeMobiBody(doc, imageUrlFor);
    chapters.push({
      title: bookTitle,
      htmlContent: (doc.body && doc.body.innerHTML) || '<p>（无法解析该 MOBI 的正文）</p>'
    });
  }
  // 保留短后记等原文页，同时让主要由整页图片组成的书使用漫画布局。
  const imageLed = pictureSections > 0 && allPicturesLocal && (
    pictureSections === chapters.length ||
    (pictureSections >= 8 && pictureSections / chapters.length >= 0.85 && appendixText <= 800)
  );
  return { chapters, pageItems: imageLed ? imagePages : null };
}
