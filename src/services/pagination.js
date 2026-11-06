/* ============================================================================
   HOMURA · 页面资源与小说分页
   ----------------------------------------------------------------------------
   按需生成图片 URL、解码图片，并把长章节按当前窗口与字号切成整屏书页。
   智能分页的测量器 DOM 由调用方注入（App.vue 的 #novelPaginationMeasurer）。
   ========================================================================== */

import { escapeHtml } from './utils.js';
import { hasArchiveSource, readArchiveBlobByPath, readArchivePageBlob } from './archiveAccess.js';


// ---- 页面资源：漫画图 / EPUB 内嵌图按需生成 URL 并解码 ----

export async function ensurePageUrlLoaded(pageObj) {
  if (!pageObj) return '';
  if (pageObj.url) return pageObj.url;
  if (pageObj.file) {
    pageObj.url = URL.createObjectURL(pageObj.file);
    return pageObj.url;
  }
  if (pageObj.nativeArchiveId != null || pageObj.zipEntry) {
    pageObj.archiveTask ??= readArchivePageBlob(pageObj)
      .then(blob => blob ? (pageObj.url ||= URL.createObjectURL(blob)) : '')
      .finally(() => { pageObj.archiveTask = null; });
    return pageObj.archiveTask;
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

// 限制并发解码，避免一本书的插图同时展开占满低端机内存。
function scheduleEpubImageDecode(book, url) {
  if (typeof Image === 'undefined' || !url) return null;
  const decodeCache = book.epubImageDecodes instanceof Map
    ? book.epubImageDecodes
    : (book.epubImageDecodes = new Map());
  if (decodeCache.has(url)) return decodeCache.get(url);

  const slots = book.epubImageDecodeSlots || (book.epubImageDecodeSlots = { active: 0, waiters: [] });
  const task = (async () => {
    if (slots.active >= 4) await new Promise(resolve => slots.waiters.push(resolve));
    slots.active++;
    try {
      const imageEl = new Image();
      imageEl.decoding = 'async';
      imageEl.src = url;
      if (imageEl.decode) {
        try {
          await imageEl.decode();
        } catch (err) {
          // 解码失败也继续尝试读取已经拿到的天然尺寸。
        }
      } else if (!imageEl.complete) {
        await new Promise(resolve => {
          imageEl.addEventListener('load', resolve, { once: true });
          imageEl.addEventListener('error', resolve, { once: true });
        });
      }
      return imageEl.naturalWidth > 0 && imageEl.naturalHeight > 0
        ? { width: imageEl.naturalWidth, height: imageEl.naturalHeight }
        : null;
    } catch (err) {
      // 单张插图解码失败不应阻断整本书打开，显示时会再次尝试。
      return null;
    } finally {
      slots.active--;
      const next = slots.waiters.shift();
      if (next) next();
    }
  })();
  decodeCache.set(url, task);
  return task;
}

export async function ensureChapterImagesResolved(chap, book) {
  if (!chap || chap.imagesResolved || !hasArchiveSource(book)) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = chap.htmlContent;
  const pendingImgs = wrapper.querySelectorAll('[data-zip-path]');
  const urlCache = book.epubImageUrls instanceof Map ? book.epubImageUrls : (book.epubImageUrls = new Map());
  const decodedImages = [];
  for (const img of pendingImgs) {
    const zipPath = img.getAttribute('data-zip-path');
    let cached = urlCache.get(zipPath);
    if (!cached) {
      // 并发章节可能引用同一张图，缓存 Promise 避免重复解包和生成 URL。
      cached = (async () => {
        const blob = await readArchiveBlobByPath(book, zipPath);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        if (!Array.isArray(book.resourceUrls)) book.resourceUrls = [];
        book.resourceUrls.push(url);
        return url;
      })();
      urlCache.set(zipPath, cached);
    }
    let url;
    try {
      url = await cached;
    } catch (err) {
      urlCache.delete(zipPath);
      throw err;
    }
    if (url) {
      const decodeTask = scheduleEpubImageDecode(book, url);
      if (img.tagName.toLowerCase() === 'image') {
        img.setAttribute('href', url);
        img.setAttribute('xlink:href', url);
      } else {
        img.setAttribute('src', url);
        if (decodeTask) decodedImages.push({ img, decodeTask });
      }
      img.removeAttribute('data-zip-path');
    }
  }
  // 把天然尺寸写回 HTML，分页测量不再依赖图片是否仍留在浏览器缓存。
  await Promise.all(decodedImages.map(async ({ img, decodeTask }) => {
    const size = await decodeTask;
    if (!size) return;
    if (!img.hasAttribute('width')) img.setAttribute('width', size.width);
    if (!img.hasAttribute('height')) img.setAttribute('height', size.height);
  }));
  chap.htmlContent = wrapper.innerHTML;
  chap.imagesResolved = true;
}

// 分章节并发解包插图，避免整本 EPUB 的图片串行等待。
export async function ensureBookImagesResolved(book, concurrency = 8) {
  const chapters = book?.chapters || [];
  if (!hasArchiveSource(book) || chapters.length === 0) return;
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, chapters.length) }, async () => {
    while (nextIndex < chapters.length) {
      const chapter = chapters[nextIndex++];
      await ensureChapterImagesResolved(chapter, book);
    }
  });
  await Promise.all(workers);
  await Promise.all(book.epubImageDecodes instanceof Map ? book.epubImageDecodes.values() : []);
}

// ---- 小说智能分页：按窗口高度与字号切成一屏一页 ----
// 返回 activePages 数组，不写任何全局状态

// 长段落按实际高度二分切开，保留行内标记；不依赖句号，避免整段被裁掉。
// 纯文本段落走按行数估算的快路径，只做少量实测校正；带行内标记的段落
// 继续使用 Range 精确切分，避免为了性能丢掉 strong/em 等结构。
function* splitPlainTextParagraph(text, measurer, maxHeight) {
  if (!text) return null;
  measurer.innerHTML = '<p></p>';
  const paragraph = measurer.firstElementChild;
  if (!paragraph) return null;

  paragraph.textContent = text;
  const fullHeight = measureBlockHeight(measurer);
  if (fullHeight <= maxHeight) return [`<p>${escapeHtml(text)}</p>`];

  const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return null;

  const parts = [];
  let start = 0;
  let pageLength = Math.max(1, Math.round(text.length * maxHeight / fullHeight));
  while (start < text.length) {
    yield;
    const remaining = text.length - start;
    let guess = Math.min(remaining, pageLength);
    let measured = 0;

    // 按行数做少量比例校正，通常 1-2 次即可贴满一页；每次都以真实布局为准。
    for (let round = 0; round < 4; round++) {
      paragraph.textContent = text.slice(start, start + guess);
      measured = measureBlockHeight(measurer);
      if (measured <= maxHeight) {
        const spareLines = Math.floor((maxHeight - measured) / lineHeight);
        if (spareLines < 1) break;
        const lines = Math.max(1, measured / lineHeight);
        const charsPerLine = Math.max(1, guess / lines);
        const next = Math.min(remaining, guess + Math.floor(spareLines * charsPerLine));
        if (next <= guess) break;
        guess = next;
      } else {
        const next = Math.max(1, Math.min(guess - 1, Math.floor(guess * maxHeight / measured)));
        if (next >= guess) break;
        guess = next;
      }
    }

    paragraph.textContent = text.slice(start, start + guess);
    measured = measureBlockHeight(measurer);
    if (measured > maxHeight) {
      let low = 1;
      let high = guess - 1;
      let fit = 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        paragraph.textContent = text.slice(start, start + middle);
        if (measureBlockHeight(measurer) <= maxHeight) {
          fit = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      guess = fit;
    }

    parts.push(`<p>${escapeHtml(text.slice(start, start + guess))}</p>`);
    start += guess;
    pageLength = guess;
  }
  return parts;
}

export function splitLongParagraph(html, measurer, maxHeight) {
  const parts = splitLongParagraphSteps(html, measurer, maxHeight);
  let result = parts.next();
  while (!result.done) result = parts.next();
  return result.value;
}

function* splitLongParagraphSteps(html, measurer, maxHeight) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const source = wrapper.firstElementChild;
  if (!source || source.tagName !== 'P' || source.querySelector('img, svg, image')) return [html];

  if (source.children.length === 0) {
    const plainParts = yield* splitPlainTextParagraph(source.textContent, measurer, maxHeight);
    if (plainParts) return plainParts;
  }

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
    yield;
    let low = start + 1;
    let high = offsets.length - 1;
    let fit = low;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      measurer.innerHTML = fragment(offsets[start], offsets[middle]);
      if (measureBlockHeight(measurer) <= maxHeight) { fit = middle; low = middle + 1; }
      else high = middle - 1;
    }
    parts.push(fragment(offsets[start], offsets[fit]));
    start = fit;
  }
  return parts;
}

const NOVEL_CONTAINER_TAGS = new Set(['body', 'main', 'section', 'article', 'div', 'header', 'footer', 'aside']);
const novelPageCache = new WeakMap();

// 分页只关心“这一页最后一行的底部”，不应把最后一段的 margin-bottom
// 也算成溢出。否则 1px 的下边距就会把整段拆到下一页，页数翻倍且大幅变慢。
function measureBlockHeight(measurer) {
  const last = measurer.lastElementChild;
  if (last && typeof last.getBoundingClientRect === 'function') {
    const rect = last.getBoundingClientRect();
    if (rect.height > 0) {
      return rect.bottom - measurer.getBoundingClientRect().top;
    }
  }
  return measurer.scrollHeight;
}

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
  const pagination = paginateBook(book, layoutConfig, measurer);
  let result = pagination.next();
  while (!result.done) result = pagination.next();
  return result.value;
}

export async function prepareActivePages(book, layoutConfig, measurer, isCurrent) {
  if (book.type === 'manga' || layoutConfig.direction === 'vertical' || !measurer?.parentNode) {
    return buildActivePages(book, layoutConfig, measurer);
  }
  // 让正在打开的书使用独立测量器，避免和当前阅读页的重排互相覆盖。
  const scratch = measurer.cloneNode(false);
  scratch.removeAttribute('id');
  scratch.style.contain = 'layout';
  measurer.after(scratch);
  const pagination = paginateBook(book, layoutConfig, scratch);
  try {
    let sliceStarted = performance.now();
    let result = pagination.next();
    while (!result.done) {
      if (performance.now() - sliceStarted >= 12) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!isCurrent()) return [];
        sliceStarted = performance.now();
      }
      result = pagination.next();
    }
    return result.value;
  } finally {
    scratch.remove();
  }
}

function* paginateBook(book, layoutConfig, measurer) {
  if (book.type === 'manga') {
    return (book.pageItems || []).map((item, idx) => ({
      pageNumber: idx + 1,
      ...(item.html ? { html: item.html, title: item.title } : {}),
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
  const cacheKey = [contentWidth, availableTextHeight, layoutConfig.fontSize].join('|');
  const cached = novelPageCache.get(book);
  if (cached && cached.key === cacheKey && cached.chapters === book.chapters) {
    return cached.pages;
  }

  measurer.style.width = contentWidth + 'px';
  measurer.style.fontSize = layoutConfig.fontSize + 'px';
  measurer.innerHTML = '';

  const pages = [];
  const chapters = book.chapters || [];

  for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
    const chap = chapters[cIdx];
    const title = chap.title || `第 ${cIdx + 1} 章`;
    const addPage = html => pages.push({ pageNumber: pages.length + 1, title, html, chapterIndex: cIdx });
    const blocks = collectNovelBlocks(chap.htmlContent);

    if (blocks.length === 0) {
      addPage('<p>（本章无正文内容）</p>');
      continue;
    }

    let currentPageParts = [];
    measurer.innerHTML = '';

    const flushCurrentPage = () => {
      const currentPageHtml = currentPageParts.join('');
      if (currentPageHtml.trim()) addPage(currentPageHtml);
      currentPageParts = [];
      measurer.innerHTML = '';
    };

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      yield;
      const blk = blocks[bIdx];
      measurer.insertAdjacentHTML('beforeend', blk.html);

      if (measureBlockHeight(measurer) <= availableTextHeight) {
        currentPageParts.push(blk.html);
        continue;
      }

      if (currentPageParts.length) {
        flushCurrentPage();
        measurer.innerHTML = blk.html;
        if (measureBlockHeight(measurer) <= availableTextHeight) {
          currentPageParts.push(blk.html);
          continue;
        }
      }
      const parts = yield* splitLongParagraphSteps(blk.html, measurer, availableTextHeight);
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        if (index < parts.length - 1) {
          addPage(part);
        } else {
          measurer.innerHTML = part;
          currentPageParts = [part];
          if (measureBlockHeight(measurer) > availableTextHeight) flushCurrentPage();
        }
      }
    }
    flushCurrentPage();
  }

  measurer.innerHTML = '';
  novelPageCache.set(book, { key: cacheKey, chapters: book.chapters, pages });
  return pages;
}

export function locateReflowedPage(oldPages, oldIndex, pages) {
  const chapter = oldPages[oldIndex]?.chapterIndex;
  if (chapter == null) return Math.min(oldIndex, pages.length - 1);
  function chapterStart(list, target) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].chapterIndex < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  const oldStart = chapterStart(oldPages, chapter);
  const oldEnd = chapterStart(oldPages, chapter + 1);
  const start = chapterStart(pages, chapter);
  const end = chapterStart(pages, chapter + 1);
  const ratio = (oldIndex - oldStart) / Math.max(1, oldEnd - oldStart - 1);
  return Math.min(pages.length - 1, start + Math.round(ratio * Math.max(0, end - start - 1)));
}
