/* ============================================================================
   HOMURA · 通用小工具
   ========================================================================== */

export function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function normalizedUrl(url) {
  return String(url || '')
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
    .trim();
}

function urlProtocol(url) {
  const probe = normalizedUrl(url);
  const match = probe.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  return match ? match[1].toLowerCase() : '';
}

export function isSafeLinkUrl(url) {
  const normalized = normalizedUrl(url);
  if (!normalized || normalized.startsWith('//')) return false;
  const protocol = urlProtocol(url);
  return !protocol || ['http', 'https', 'mailto', 'tel'].includes(protocol);
}

// 书内图片只允许嵌入位图或相对路径，避免 HTML 内容在阅读时偷偷发起外部请求。
export function isSafeImageUrl(url) {
  const raw = String(url || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!raw) return false;
  if (/^data:image\/(?:jpeg|png|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(raw)) return true;
  const protocol = urlProtocol(raw);
  if (protocol) return false;
  // 浏览器会把反斜杠规范化为斜杠，必须一并挡住伪协议相对地址。
  return !raw.startsWith('//') && !raw.includes('\\');
}

// 书籍格式：优先读 format 字段；旧存档没有该字段时按 id 前缀推断，避免老书筛选失效。
const FORMAT_BY_ID_PREFIX = [
  ['epub_', 'epub'],
  ['cbz_', 'cbz'],
  ['pdf_', 'pdf'],
  ['mobi_', 'mobi'],
  ['md_', 'markdown'],
  ['txt_', 'txt'],
  ['img_', 'images']
];

export function resolveBookFormat(book) {
  if (!book) return null;
  if (book.format) return book.format;
  const id = String(book.id || '');
  const hit = FORMAT_BY_ID_PREFIX.find(([prefix]) => id.startsWith(prefix));
  if (hit) return hit[1];
  // 早期 EPUB 直接以 type 标记，仍按 EPUB 归类
  return book.type === 'epub' ? 'epub' : null;
}
