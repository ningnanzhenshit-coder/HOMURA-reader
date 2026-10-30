/* ============================================================================
   HOMURA · 阅读内容净化
   ----------------------------------------------------------------------------
   EPUB 的 XHTML 会通过 v-html 进入阅读器，必须在解析阶段移除脚本、事件属性
   与外部资源。这里使用标签/属性白名单，同时保留常见排版、表格、脚注与 SVG。
   ========================================================================== */

import { isSafeImageUrl, isSafeLinkUrl } from './utils.js';

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'big', 'blockquote', 'br',
  'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
  'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'kbd',
  'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rb', 'rp', 'rt', 'rtc',
  'ruby', 's', 'samp', 'section', 'small', 'span', 'strike', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time',
  'tr', 'tt', 'u', 'ul', 'var', 'wbr',
  // 常见 EPUB 封面/插图会使用内联 SVG；脚本与事件属性仍会被统一剔除。
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'defs', 'use', 'image', 'title', 'desc', 'clippath', 'lineargradient',
  'radialgradient', 'stop', 'pattern',
  // MathML 基础标签
  'math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'msubsup', 'mfrac',
  'msqrt', 'mroot', 'mtext', 'mspace', 'mtable', 'mtr', 'mtd'
]);

const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'frame', 'frameset',
  'form', 'input', 'button', 'select', 'option', 'optgroup', 'textarea', 'link',
  'meta', 'base', 'template', 'noscript', 'video', 'audio', 'source', 'track',
  'canvas', 'map', 'area', 'portal', 'foreignobject', 'animate', 'animatemotion',
  'animatetransform', 'set', 'handler'
]);

// 不保留 class / style，避免书内 HTML 借应用自身的 Tailwind 类覆盖阅读器界面。
const GLOBAL_ATTRS = new Set([
  'id', 'title', 'lang', 'dir', 'role', 'alt', 'width', 'height',
  'align', 'valign', 'colspan', 'rowspan', 'headers', 'scope', 'start',
  'reversed', 'value', 'type', 'datetime', 'abbr', 'axis', 'border',
  'cellpadding', 'cellspacing', 'color', 'size', 'face', 'open'
]);

const SVG_ATTRS = new Set([
  'viewbox', 'preserveaspectratio', 'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'transform',
  'opacity', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'clip-path', 'clip-rule', 'offset',
  'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'patternunits',
  'patterncontentunits', 'patterntransform'
]);

function svgUrlIsSafe(value) {
  const matches = String(value || '').match(/url\(\s*(['"]?)(.*?)\1\s*\)/gi) || [];
  return matches.every(item => /url\(\s*(['"]?)#[^)]+\1\s*\)/i.test(item));
}

function cleanUrlValue(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

function sanitizeAttributes(el, tagName) {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    if (name.startsWith('on') || name === 'style' || name === 'srcset' || name === 'srcdoc') {
      el.removeAttribute(attr.name);
      continue;
    }

    if (name === 'data-zip-path') {
      if (tagName !== 'img' && tagName !== 'image') el.removeAttribute(attr.name);
      continue;
    }
    if (name.startsWith('aria-')) continue;

    if (name === 'href' || name === 'xlink:href') {
      const safe = tagName === 'a'
        ? isSafeLinkUrl(value)
        : tagName === 'use'
          ? cleanUrlValue(value).startsWith('#')
          : (tagName === 'image' || tagName === 'img') && isSafeImageUrl(value);
      if (!safe) el.removeAttribute(attr.name);
      else attr.value = cleanUrlValue(value);
      continue;
    }

    if (name === 'src') {
      if (tagName !== 'img' || !isSafeImageUrl(value)) el.removeAttribute(attr.name);
      else attr.value = cleanUrlValue(value);
      continue;
    }

    if ((name === 'fill' || name === 'stroke' || name === 'clip-path' || name === 'filter' || name === 'mask')
      && !svgUrlIsSafe(value)) {
      el.removeAttribute(attr.name);
      continue;
    }

    if (!GLOBAL_ATTRS.has(name) && !SVG_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
    }
  }
}

function unwrap(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove();
}

export function sanitizeEpubHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const root = doc.body;
  if (!root) return '';

  const elements = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    elements.push(node);
    node = walker.nextNode();
  }

  for (const el of elements) {
    if (!el.isConnected) continue;
    const tagName = (el.localName || el.tagName).toLowerCase();

    if (DROP_WITH_CONTENT.has(tagName)) {
      el.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tagName)) {
      unwrap(el);
      continue;
    }

    sanitizeAttributes(el, tagName);
  }

  return root.innerHTML.trim();
}
