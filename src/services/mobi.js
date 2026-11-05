/* ============================================================================
   HOMURA · MOBI（PalmDOC / PDB）解析
   ----------------------------------------------------------------------------
   容器解析优先交给 Rust（src-tauri/src/mobi_parser.rs），本文件保留完整的
   JS 解析作为兜底，并继续负责所有 DOM 相关的正文净化与章节切分：
     · PDB 记录表 → 文本记录
     · PalmDOC LZ77 解压（压缩方式 1/2）
     · MOBI 头 + EXTH 元数据（书名、封面、图片记录）
     · 按 <mbp:pagebreak> 切章，正文做白名单净化后交给小说渲染管道
   不支持：DRM 加密文件、Huffman 压缩（方式 17480）、AZW3/KF8 双头格式。
   ========================================================================== */

import {
  NativeErrorCode,
  bytesToBase64,
  canUseNativeBridge,
  runNativeWithFallback
} from './nativeRuntime.js';

const BLOCKED_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'textarea', 'select', 'option', 'link', 'meta', 'base', 'frame', 'frameset', 'applet'
]);

const TAG_HEADINGS = 'h1,h2,h3,h4,h5,h6,font,p,div,td,th';

// 漫画判定：与图片型 EPUB 同一套思路，有实质正文的轻小说始终走小说管道。
const MOBI_TEXT_PAGE_MIN_LENGTH = 60;
const MOBI_TEXT_PAGE_RATIO_LIMIT = 0.15;
const MOBI_MIN_MANGA_IMAGES = 6;

// 大文件继续走 JS，避免 base64 与 IPC 先把内存吃掉；失败时始终有同步兜底。
export const NATIVE_MOBI_MAX_BYTES = 16 * 1024 * 1024;

const MOBI_NATIVE_FALLBACK_CODES = [
  NativeErrorCode.UNAVAILABLE,
  NativeErrorCode.UNSUPPORTED,
  NativeErrorCode.DISABLED,
  NativeErrorCode.COMMAND_FAILED,
  NativeErrorCode.INVALID_DATA
];

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

function imageRecordAt(buf, starts, recordIndex) {
  if (recordIndex < 0 || recordIndex + 1 >= starts.length) return null;
  const start = starts[recordIndex];
  const end = starts[recordIndex + 1] ?? buf.length;
  if (start == null || start >= end) return null;
  const mime = imageMime(buf.subarray(start, end));
  return mime ? { start, end, mime } : null;
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
    if (id === 123) result.cdeType = decodeText(buf.subarray(p + 8, p + len), 'utf-8').toLowerCase();
    if (id === 525) result.writingMode = decodeText(buf.subarray(p + 8, p + len), 'utf-8').toLowerCase();
    if (id === 527) result.pageProgression = decodeText(buf.subarray(p + 8, p + len), 'utf-8').toLowerCase();
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

// 图片记录缺失时不能直接把 <img> 删掉，否则整页会从分页结果里消失。
// 保留一个等高的占位页，让页码与书里的页序继续对得上。
function replaceWithMissingPage(dom, node) {
  const alt = (node.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
  const label = alt ? `${alt} · 图片数据缺失` : '图片数据缺失';
  const figure = dom.createElement('figure');
  figure.setAttribute('class', 'mobi-missing-page');
  figure.setAttribute('role', 'img');
  figure.setAttribute('aria-label', label);
  const caption = dom.createElement('figcaption');
  caption.textContent = label;
  figure.appendChild(caption);
  node.replaceWith(figure);
}

function sanitizeInto(dom, imageUrlFor) {
  const walker = dom.createTreeWalker(dom.body || dom.documentElement, NodeFilter.SHOW_ELEMENT);
  const doomed = [];
  let missingImages = 0;
  let node = walker.nextNode();
  while (node) {
    const tag = node.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tag)) {
      doomed.push(node);
    } else {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'style' || name === 'srcset') {
          node.removeAttribute(attr.name);
        } else if (name === 'href') {
          const value = (attr.value || '').trim();
          if (!/^(https?:|mailto:|tel:)/i.test(value)) node.removeAttribute(attr.name);
        }
      }
      if (tag === 'img') {
        const recindex = parseInt(node.getAttribute('recindex') || '', 10);
        node.removeAttribute('recindex');
        if (Number.isInteger(recindex) && recindex > 0) {
          const url = imageUrlFor(recindex);
          if (url) node.setAttribute('src', url);
          else {
            replaceWithMissingPage(dom, node);
            missingImages++;
          }
        } else if (!/^(https?:|data:image\/)/i.test(node.getAttribute('src') || '')) {
          replaceWithMissingPage(dom, node);
          missingImages++;
        }
      }
      if (tag === 'a' && !node.getAttribute('href')) {
        // 无 href 的锚点（MOBI 内部 filepos）直接拆掉，避免渲染成彩色假链接
        node.replaceWith(...Array.from(node.childNodes));
      }
    }
    node = walker.nextNode();
  }
  doomed.forEach(el => el.remove());
  return missingImages;
}

// ---- 章节标题：取首个短标题块，否则退化为书号 ----

function pickChapterTitle(body, fallbackTitle, index) {
  const nodes = body.querySelectorAll(TAG_HEADINGS);
  for (let i = 0; i < Math.min(nodes.length, 4); i++) {
    const text = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
    if (text && text.length <= 60 && /[\u4e00-\u9fa5a-zA-Z]/.test(text)) return text;
  }
  const alt = (body.querySelector('img[alt]')?.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
  if (alt && alt.length <= 60 && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(alt)) return alt;
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

  // 统一整理成图片记录表：原生路径直接给出文件区间，JS 路径从 PDB 记录表现扫。
  const imageRecords = [];
  for (let recordIndex = firstImage; recordIndex + 1 < starts.length; recordIndex++) {
    const record = imageRecordAt(buf, starts, recordIndex);
    if (!record) continue;
    imageRecords.push({
      recindex: recordIndex - firstImage + 1,
      ...record
    });
  }

  // 封面：优先 EXTH 201，失效时退回首张图片
  const coverIndex = Number.isInteger(exth.coverOffset) ? firstImage + exth.coverOffset : firstImage;
  const coverRecord = imageRecordAt(buf, starts, coverIndex)
    || imageRecordAt(buf, starts, firstImage);
  const coverBlob = coverRecord
    ? new Blob([buf.subarray(coverRecord.start, coverRecord.end)], { type: coverRecord.mime })
    : null;

  const title = (exth.title || '').trim() || headerTitle || fallbackTitle;
  return buildMobiBookData({
    title,
    rawText,
    compression,
    encoding,
    cdeType: exth.cdeType || '',
    writingMode: exth.writingMode || '',
    pageProgression: exth.pageProgression || '',
    imageRecords,
    coverBlob,
    pageRangeBase: buf.byteOffset,
    createImageBlob: record => new Blob(
      [buf.subarray(record.start, record.end)],
      { type: record.mime }
    )
  });
}

// Rust 只负责容器与正文，DOM 解析、漫画判定、章节切分和正文净化仍在这里完成。
export function buildMobiBookData(container) {
  const {
    title,
    rawText,
    compression = 0,
    encoding = '',
    cdeType = '',
    writingMode = '',
    pageProgression = '',
    imageRecords = [],
    coverBlob = null,
    pageRangeBase = 0,
    createImageBlob
  } = container || {};
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new MobiError('BAD_FILE', 'MOBI 正文为空');
  }
  if (typeof createImageBlob !== 'function') {
    throw new TypeError('buildMobiBookData 需要 createImageBlob');
  }

  const recordsByIndex = new Map();
  for (const record of imageRecords) {
    if (!record || !Number.isInteger(record.recindex) || record.recindex <= 0) continue;
    if (!Number.isInteger(record.start) || !Number.isInteger(record.end) || record.end <= record.start) continue;
    recordsByIndex.set(record.recindex, record);
  }

  // 图片记录惰性建 URL，只有正文真正引用时才占内存。
  const imageUrls = new Map();
  const imageUrlFor = recindex => {
    const record = recordsByIndex.get(recindex);
    if (!record) return null;
    const cached = imageUrls.get(record.start);
    if (cached) return cached.url;
    const blob = createImageBlob(record);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    imageUrls.set(record.start, { url, mime: record.mime });
    return url;
  };

  const { cleaned, parts } = splitMobiParts(rawText);
  const docs = parseMobiDocs(parts);
  const isComic = shouldReadMobiAsManga(docs, cdeType);
  const comicPages = isComic ? collectMobiPages(docs) : [];

  let chapters = [];
  let pages = [];
  if (comicPages.length > 0) {
    pages = comicPages.map(page => {
      const record = recordsByIndex.get(page.recindex);
      return {
        alt: page.alt,
        start: record ? pageRangeBase + record.start : null,
        end: record ? pageRangeBase + record.end : null,
        mime: record ? record.mime : null
      };
    });
    const missingPages = pages.filter(page => page.start == null).length;
    if (missingPages > 0) {
      console.warn(`[HOMURA] MOBI 有 ${missingPages} 页图片记录缺失或损坏，已保留空页以维持页码`);
    }
  } else {
    chapters = splitChapters(docs, cleaned, title, imageUrlFor);
  }

  const isRtl = writingMode === 'rtl' || writingMode.endsWith('-rl')
    || pageProgression === 'rtl' || pageProgression.endsWith('-rl');
  const readingDirection = isRtl ? 'rtl' : 'ltr';

  return {
    title,
    type: pages.length > 0 ? 'manga' : 'novel',
    chapters,
    pages,
    readingDirection,
    coverBlob,
    compression,
    encoding,
    resourceUrls: Array.from(imageUrls.values(), image => image.url)
  };
}

function normalizeNativeMobiRecord(record, fileSize, requireRecindex) {
  const validRecindex = !requireRecindex
    || (Number.isInteger(record?.recindex) && record.recindex > 0);
  if (!record
    || !validRecindex
    || !Number.isInteger(record.start)
    || !Number.isInteger(record.end)
    || record.start < 0
    || record.end <= record.start
    || record.end > fileSize
    || typeof record.mime !== 'string'
    || !record.mime) {
    throw new MobiError('BAD_FILE', '原生 MOBI 图片记录无效');
  }
  return {
    recindex: record.recindex,
    start: record.start,
    end: record.end,
    mime: record.mime
  };
}

function buildMobiDataFromNative(container, file, fallbackTitle) {
  if (!container
    || typeof container.title !== 'string'
    || typeof container.rawText !== 'string'
    || !Array.isArray(container.imageRecords)) {
    throw new MobiError('BAD_FILE', '原生 MOBI 解析结果无效');
  }

  const imageRecords = container.imageRecords.map(
    record => normalizeNativeMobiRecord(record, file.size, true)
  );
  const cover = container.cover
    ? normalizeNativeMobiRecord(container.cover, file.size, false)
    : null;

  return buildMobiBookData({
    title: container.title.trim() || fallbackTitle,
    rawText: container.rawText,
    compression: container.compression,
    encoding: container.encoding,
    cdeType: container.cdeType || '',
    writingMode: container.writingMode || '',
    pageProgression: container.pageProgression || '',
    imageRecords,
    coverBlob: cover ? file.slice(cover.start, cover.end, cover.mime) : null,
    pageRangeBase: 0,
    createImageBlob: record => file.slice(record.start, record.end, record.mime)
  });
}

// Tauri 环境优先让 Rust 解 PDB / PalmDOC；原生失败或文件过大时仍交给 JS。
export async function parseMobiFileData(file, fallbackTitle = 'MOBI') {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fallback = () => parseMobiBuffer(bytes, fallbackTitle);
  if (bytes.length === 0 || bytes.length > NATIVE_MOBI_MAX_BYTES || !canUseNativeBridge()) {
    return fallback();
  }

  const payload = bytesToBase64(bytes);
  if (payload === null) return fallback();

  const container = await runNativeWithFallback({
    feature: 'mobi',
    command: 'parse_mobi_container',
    args: { bytesBase64: payload, fallbackTitle },
    fallback: () => null,
    fallbackOn: MOBI_NATIVE_FALLBACK_CODES
  });
  if (!container) return fallback();

  try {
    return buildMobiDataFromNative(container, file, fallbackTitle);
  } catch (err) {
    console.warn('[HOMURA] MOBI 原生解析结果不可用，回退 JS', err);
    return fallback();
  }
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

function splitMobiParts(rawText) {
  // 去掉 <head>/<guide> 引导信息，只留正文
  const cleaned = rawText
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<guide[\s\S]*?<\/guide>/gi, '');

  let parts = cleaned.split(/<mbp:pagebreak\s*\/?>/i).filter(p => p && p.trim());
  if (parts.length === 1) {
    // 没有分页标记的书：退化为按标题标签切分
    parts = cleaned.split(/(?=<h[1-3][\s>])/i).filter(p => p && p.trim());
  }
  return { cleaned, parts };
}

function parseMobiDocs(parts) {
  const parser = new DOMParser();
  return parts.map(part => parser.parseFromString(part, 'text/html'));
}

function shouldReadMobiAsManga(docs, cdeType) {
  if (cdeType === 'comic') return true;
  if (docs.length === 0) return false;

  let textPages = 0;
  let imageCount = 0;
  for (const doc of docs) {
    if (!doc.body) continue;
    const text = (doc.body.textContent || '').replace(/\s+/g, '');
    if (text.length >= MOBI_TEXT_PAGE_MIN_LENGTH) textPages++;
    imageCount += doc.body.querySelectorAll('img[recindex]').length;
  }
  if (imageCount < MOBI_MIN_MANGA_IMAGES) return false;
  return textPages / docs.length <= MOBI_TEXT_PAGE_RATIO_LIMIT;
}

function collectMobiPages(docs) {
  const pages = [];
  for (const doc of docs) {
    if (!doc.body) continue;
    for (const img of doc.body.querySelectorAll('img[recindex]')) {
      const recindex = parseInt(img.getAttribute('recindex') || '', 10);
      if (!Number.isInteger(recindex) || recindex <= 0) continue;
      pages.push({
        recindex,
        alt: (img.getAttribute('alt') || '').replace(/\s+/g, ' ').trim()
      });
    }
  }
  return pages;
}

function splitChapters(docs, cleaned, bookTitle, imageUrlFor) {
  const chapters = [];
  let missingImages = 0;
  docs.forEach((doc, index) => {
    if (!doc.body) return;
    const title = pickChapterTitle(doc.body, bookTitle, index);
    missingImages += sanitizeInto(doc, imageUrlFor);
    const html = (doc.body.innerHTML || '').trim();
    const hasText = !!doc.body.textContent.replace(/\s+/g, '').length;
    const hasImage = !!doc.body.querySelector('img, svg, image, figure.mobi-missing-page');
    if (!html || (!hasText && !hasImage)) return;
    chapters.push({
      title,
      htmlContent: html
    });
  });

  if (missingImages > 0) {
    console.warn(`[HOMURA] MOBI 有 ${missingImages} 张图片记录缺失或损坏，已保留占位页以维持页码`);
  }

  if (chapters.length === 0) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleaned, 'text/html');
    sanitizeInto(doc, imageUrlFor);
    chapters.push({
      title: bookTitle,
      htmlContent: (doc.body && doc.body.innerHTML) || '<p>（无法解析该 MOBI 的正文）</p>'
    });
  }
  return chapters;
}
