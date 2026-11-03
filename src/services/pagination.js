/* ============================================================================
   HOMURA · 页面资源与小说分页
   ----------------------------------------------------------------------------
   按需生成图片 URL、解码图片，并把长章节按当前窗口与字号切成整屏书页。
   智能分页的测量器 DOM 由调用方注入（App.vue 的 #novelPaginationMeasurer）。
   ========================================================================== */

import { escapeHtml } from './utils.js';


// ---- 页面资源：漫画图 / EPUB 内嵌图按需生成 URL 并解码 ----

export async function ensurePageUrlLoaded(pageObj) {
  if (!pageObj) return '';
  if (pageObj.url) return pageObj.url;
  if (pageObj.file) {
    pageObj.url = URL.createObjectURL(pageObj.file);
    return pageObj.url;
  }
  if (pageObj.zipEntry) {
    const blob = await pageObj.zipEntry.async('blob');
    pageObj.url = URL.createObjectURL(blob);
    return pageObj.url;
  }
  // PDF 等需要现场渲染的页面：同一页并发请求共用一次渲染任务
  if (pageObj.render) {
    if (!pageObj.renderTask) pageObj.renderTask = pageObj.render();
    try {
      pageObj.url = await pageObj.renderTask;
    } finally {
      pageObj.renderTask = null;
    }
    return pageObj.url || '';
  }
  return '';
}

export async function decodeImgIntoElement(imgEl, url) {
  if (!imgEl) return;
  if (!url) {
    imgEl.removeAttribute('src');
    imgEl.setAttribute('data-current-src', '');
    return;
  }
  if (imgEl.getAttribute('data-current-src') === url) return;
  imgEl.src = url;
  imgEl.setAttribute('data-current-src', url);
  if (imgEl.decode) {
    try {
      await imgEl.decode();
    } catch (e) {}
  }
}

export async function ensureChapterImagesResolved(chap, book) {
  if (!chap || chap.imagesResolved || !book.zipContent) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = chap.htmlContent;
  const pendingImgs = wrapper.querySelectorAll('[data-zip-path]');
  for (const img of pendingImgs) {
    const zipPath = img.getAttribute('data-zip-path');
    const entry = book.zipContent.file(zipPath);
    if (entry) {
      const blob = await entry.async('blob');
      const url = URL.createObjectURL(blob);
      if (img.tagName.toLowerCase() === 'image') {
        img.setAttribute('href', url);
        img.setAttribute('xlink:href', url);
      } else {
        img.setAttribute('src', url);
      }
      img.removeAttribute('data-zip-path');
    }
  }
  chap.htmlContent = wrapper.innerHTML;
  chap.imagesResolved = true;
}

// ---- 小说智能分页：按窗口高度与字号切成一屏一页 ----
// 返回 activePages 数组，不写任何全局状态

// 长段落按实际高度二分切开，保留行内标记；不依赖句号，避免整段被裁掉。
export function splitLongParagraph(html, measurer, maxHeight) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const source = wrapper.firstElementChild;
  if (!source || source.tagName !== 'P' || source.querySelector('img, svg, image')) return [html];

  // <br> 没有文本，但换行本身占高度；把它当作一个虚拟字符参与 Range 定位。
  const atoms = [];
  let length = 0;
  function collect(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!child.length) continue;
        atoms.push({ type: 'text', node: child, start: length, end: length + child.length });
        length += child.length;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          atoms.push({ type: 'break', node: child, start: length, end: length + 1 });
          length += 1;
        } else {
          collect(child);
        }
      }
    }
  }
  collect(source);
  if (!length) return [html];

  const offsets = [0];
  for (const atom of atoms) {
    if (atom.type === 'break') {
      offsets.push(atom.end);
      continue;
    }
    for (const character of atom.node.data) {
      offsets.push(offsets[offsets.length - 1] + character.length);
    }
  }

  function locate(offset) {
    for (const atom of atoms) {
      if (atom.type === 'text') {
        if (offset <= atom.end) {
          return { type: 'text', node: atom.node, offset: Math.max(0, offset - atom.start) };
        }
      } else if (offset <= atom.start) {
        return { type: 'before', node: atom.node };
      } else if (offset <= atom.end) {
        return { type: 'after', node: atom.node };
      }
    }
    const last = atoms[atoms.length - 1];
    return last.type === 'text'
      ? { type: 'text', node: last.node, offset: last.node.length }
      : { type: 'after', node: last.node };
  }

  function fragment(start, end) {
    const range = document.createRange();
    const from = locate(start);
    const to = locate(end);
    if (from.type === 'text') range.setStart(from.node, from.offset);
    else if (from.type === 'before') range.setStartBefore(from.node);
    else range.setStartAfter(from.node);
    if (to.type === 'text') range.setEnd(to.node, to.offset);
    else if (to.type === 'before') range.setEndBefore(to.node);
    else range.setEndAfter(to.node);
    const paragraph = source.cloneNode(false);
    paragraph.append(range.cloneContents());
    return paragraph.outerHTML;
  }
  const parts = [];
  let start = 0;
  while (start < offsets.length - 1) {
    let low = start + 1;
    let high = offsets.length - 1;
    let fit = low;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      measurer.innerHTML = fragment(offsets[start], offsets[middle]);
      if (measurer.scrollHeight <= maxHeight) { fit = middle; low = middle + 1; }
      else high = middle - 1;
    }
    parts.push(fragment(offsets[start], offsets[fit]));
    start = fit;
  }
  return parts;
}

const NOVEL_CONTAINER_TAGS = new Set(['body', 'main', 'section', 'article', 'div', 'header', 'footer', 'aside']);

// EPUB 常把整章包在 section/div 里；结构容器必须拆开分页，否则含图的整章会被裁成一页。
// 只在容器没有直接文本时递归展开，避免丢掉混在子元素之间的文字。
export function collectNovelBlocks(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html || '';
  const blocks = [];

  function hasDirectText(node) {
    return Array.from(node.childNodes).some(child => (
      child.nodeType === Node.TEXT_NODE && child.textContent.trim()
    ));
  }

  function pushNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) blocks.push({ type: 'p', text, html: `<p>${escapeHtml(text)}</p>` });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    if (NOVEL_CONTAINER_TAGS.has(tag) && node.children.length > 0 && !hasDirectText(node)) {
      Array.from(node.childNodes).forEach(pushNode);
      return;
    }

    blocks.push({ type: tag, text: node.textContent.trim(), html: node.outerHTML });
  }

  Array.from(wrapper.childNodes).forEach(pushNode);
  return blocks;
}

export function buildActivePages(book, layoutConfig, measurer) {
  if (book.type === 'manga') {
    return (book.pageItems || []).map((item, idx) => ({
      pageNumber: idx + 1,
      itemRef: item
    }));
  }

  if (layoutConfig.direction === 'vertical') {
    return (book.chapters || []).map((chap, idx) => ({
      pageNumber: idx + 1,
      title: chap.title || `第 ${idx + 1} 节`,
      html: chap.htmlContent,
      chapterIndex: idx
    }));
  }

  const vw = window.innerWidth || 1024;
  // 用布局视口高度：移动端 window.innerHeight 含地址栏，滚动时会抖动导致重复分页
  const vh = document.documentElement.clientHeight || window.innerHeight || 768;
  const compact = vw < 768;

  const isDouble = layoutConfig.spread === 2 && !compact;
  const stageWidth = document.querySelector('[data-reader-stage]')?.clientWidth || vw;
  const outerPadding = vw >= 640 ? 32 : 16;
  const cardOuterWidth = isDouble
    ? (Math.min(1152, stageWidth) - outerPadding - 12) / 2
    : Math.min(660, stageWidth - outerPadding);
  const cardHorizontalPadding = vw >= 640 ? 80 : 48;
  const contentWidth = Math.max(80, cardOuterWidth - cardHorizontalPadding - 2);
  // 工具栏（顶 56 + 底 48）与卡片内外边距之和：桌面沿用既有实测值，移动端按紧凑布局
  const chromeHeight = compact ? 236 : 267;
  const availableTextHeight = Math.max(160, vh - chromeHeight);

  measurer.style.width = contentWidth + 'px';
  measurer.style.fontSize = layoutConfig.fontSize + 'px';
  measurer.innerHTML = '';

  const paginatedList = [];
  const chapters = book.chapters || [];

  for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
    const chap = chapters[cIdx];
    const blocks = collectNovelBlocks(chap.htmlContent);

    if (blocks.length === 0) {
      paginatedList.push({
        title: chap.title || `第 ${cIdx + 1} 章`,
        html: '<p>（本章无正文内容）</p>',
        chapterIndex: cIdx
      });
      continue;
    }

    let currentPageHtml = '';
    measurer.innerHTML = '';

    const flushCurrentPage = () => {
      if (currentPageHtml.trim()) {
        paginatedList.push({
          title: chap.title || `第 ${cIdx + 1} 章`,
          html: currentPageHtml,
          chapterIndex: cIdx
        });
        currentPageHtml = '';
        measurer.innerHTML = '';
      }
    };

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const blk = blocks[bIdx];
      const prevHtml = currentPageHtml;
      const candidateHtml = prevHtml + blk.html;
      measurer.innerHTML = candidateHtml;

      if (measurer.scrollHeight <= availableTextHeight) {
        currentPageHtml = candidateHtml;
      } else {
        if (prevHtml) flushCurrentPage();
        measurer.innerHTML = blk.html;
        const parts = measurer.scrollHeight > availableTextHeight ? splitLongParagraph(blk.html, measurer, availableTextHeight) : [blk.html];
        for (let index = 0; index < parts.length; index++) {
          currentPageHtml = parts[index];
          measurer.innerHTML = currentPageHtml;
          if (index < parts.length - 1 || measurer.scrollHeight > availableTextHeight) flushCurrentPage();
        }
      }
    }
    flushCurrentPage();
  }

  measurer.innerHTML = '';
  return paginatedList.map((item, idx) => ({
    pageNumber: idx + 1,
    title: item.title,
    html: item.html,
    chapterIndex: item.chapterIndex
  }));
}
