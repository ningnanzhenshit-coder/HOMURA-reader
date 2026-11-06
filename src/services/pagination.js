/* ============================================================================
   HOMURA · 页面资源与小说分页
   ----------------------------------------------------------------------------
   按需生成图片 URL、解码图片，并把长章节按当前窗口与字号切成整屏书页。
   智能分页的测量器 DOM 由调用方注入（App.vue 的 #novelPaginationMeasurer）。
   ========================================================================== */

import { escapeHtml } from './utils.js';
import { hasArchiveSource, readArchiveBlobByPath, readArchivePageBlob } from './archiveAccess.js';
import { ensureNativePageAsset } from './nativeArchive.js';

// asset 协议不可用（旧包 / 配置缺失）时整本书回退 Blob，避免每页都试一次
let nativeAssetUsable = true;
let nativeAssetFailureStreak = 0;
const NATIVE_ASSET_FAILURE_LIMIT = 2;

function canUseNativeAsset() {
  return typeof window !== 'undefined'
    && typeof window.__TAURI__?.core?.convertFileSrc === 'function';
}

// ---- 页面资源：漫画图 / EPUB 内嵌图按需生成 URL 并解码 ----

export async function ensurePageUrlLoaded(pageObj) {
  if (!pageObj) return '';
  if (pageObj.url) return pageObj.url;
  if (pageObj.file) {
    pageObj.url = URL.createObjectURL(pageObj.file);
    return pageObj.url;
  }
  // MOBI 漫画页只记录原文件里的记录区间，翻到哪页才切哪页的 Blob，避免整本解压进内存。
  if (pageObj.mobiFile && pageObj.mobiRange) {
    const [start, end] = pageObj.mobiRange;
    pageObj.url = URL.createObjectURL(pageObj.mobiFile.slice(start, end, pageObj.mobiMime || ''));
    return pageObj.url;
  }
  // 原生页优先走 asset:// 直连：Android 已降采样转码，桌面直接复用原图，
  // WebView 只读本地文件，不再把整页字节经 IPC 拷进 JS。
  if (pageObj.nativeArchiveId != null && nativeAssetUsable
    && !pageObj.nativeAssetUnavailable && canUseNativeAsset()) {
    if (!pageObj.assetTask) {
      pageObj.assetTask = ensureNativePageAsset(pageObj.nativeArchiveId, pageObj.nativeIndex)
        .catch(err => {
          console.warn('[HOMURA] 原生页资源不可用，回退 Blob', err);
          return null;
        });
    }
    try {
      const asset = await pageObj.assetTask;
      if (asset?.url) {
        pageObj.url = asset.url;
        pageObj.urlIsAsset = true;
        return pageObj.url;
      }
    } finally {
      pageObj.assetTask = null;
    }
    // 单次失败可能是刚关书导致会话已释放，不能据此永久禁用 asset
    pageObj.nativeAssetUnavailable = true;
  }
  if (pageObj.nativeArchiveId != null || pageObj.zipEntry) {
    // 预载与翻页可能同时命中同一页：archiveTask 共享了 Blob，URL 也必须在任务内部
    // 只建一次。若放到任务外创建，每个并发调用者都会 createObjectURL，
    // 后写入 pageObj.url 会覆盖前一个，先建的 URL 就再也 revoke 不到。
    if (!pageObj.archiveTask) {
      const task = readArchivePageBlob(pageObj)
        .then(blob => {
          if (blob && !pageObj.url) pageObj.url = URL.createObjectURL(blob);
          return pageObj.url || '';
        })
        .catch(err => {
          console.warn('[HOMURA] 页面读取失败，显示为空页', err);
          return '';
        })
        .finally(() => {
          if (pageObj.archiveTask === task) pageObj.archiveTask = null;
        });
      pageObj.archiveTask = task;
    }
    return await pageObj.archiveTask;
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

// ---- 页图 URL 生命周期：只保留当前阅读窗口，其余立即回收 ----
// 一张 4K 漫画页解码后是几十 MB；整本读过的页若一直挂在内存里，
// 安卓 WebView 会越读越卡。首页与书封共用同一个 URL，不能误回收。
function releasePageItemUrl(book, item) {
  if (!item || !item.url) return;
  // 只有能重新解出来的页才允许回收；示例书这类纯 URL 页没有后备来源，
  // 清掉就再也拿不回来了。
  const canReload = !!(
    item.file
    || (item.mobiFile && item.mobiRange)
    || item.zipEntry
    || item.nativeArchiveId != null
    || item.render
  );
  if (!canReload) return;
  const url = item.url;
  if (url === book.cover) return;
  if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
  item.url = '';
  // 单页可能只是撞上原生缓存轮换；回收后允许下次重新走 asset，而不是永久降级 Blob
  if (item.nativeArchiveId != null) item.nativeAssetUnavailable = false;
}

export function releaseDistantPageUrls(book, currentIndex, radius = 4) {
  if (!book || book.type !== 'manga') return;
  const items = book.pageItems || [];
  const keepFrom = currentIndex - radius;
  const keepTo = currentIndex + radius;
  for (let i = 0; i < items.length; i++) {
    if (i >= keepFrom && i <= keepTo) continue;
    releasePageItemUrl(book, items[i]);
  }
}

export function releaseBookPageUrls(book) {
  if (!book || book.type !== 'manga') return;
  (book.pageItems || []).forEach(item => releasePageItemUrl(book, item));
}

export async function decodeImgIntoElement(imgEl, url, pageObj, options = {}) {
  if (!imgEl) return false;
  if (!url) {
    // 复用的翻页槽位需要清掉旧页；条漫的 img 是每页独占的，
    // 临时读取失败时保留已解码的图，避免把页面高度一起清掉。
    if (!options.preserveSrcOnEmpty) {
      imgEl.removeAttribute('src');
      imgEl.setAttribute('data-current-src', '');
    }
    return false;
  }
  if (imgEl.getAttribute('data-current-src') === url) {
    if (pageObj?.urlIsAsset) nativeAssetFailureStreak = 0;
    return true;
  }
  imgEl.src = url;
  imgEl.setAttribute('data-current-src', url);
  if (imgEl.decode) {
    try {
      await imgEl.decode();
    } catch (e) {
      // 翻页过快会中断上一次 decode，此时 src 已经被替换，不算加载失败
      if (imgEl.getAttribute('data-current-src') !== url) return true;
      if (imgEl.naturalWidth > 0) {
        if (pageObj?.urlIsAsset) nativeAssetFailureStreak = 0;
        return true;
      }
      if (pageObj?.urlIsAsset) {
        nativeAssetFailureStreak += 1;
        // 连续两页都失败才认为 asset 通道整体不可用，避免一次缓存竞态整本书退回 Blob
        if (nativeAssetFailureStreak >= NATIVE_ASSET_FAILURE_LIMIT) nativeAssetUsable = false;
        pageObj.nativeAssetUnavailable = true;
        pageObj.url = '';
        pageObj.urlIsAsset = false;
      }
      return false;
    }
  }
  if (pageObj && !pageObj.imageWidth && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
    pageObj.imageWidth = imgEl.naturalWidth;
    pageObj.imageHeight = imgEl.naturalHeight;
  }
  if (pageObj?.urlIsAsset) nativeAssetFailureStreak = 0;
  return true;
}

// 统一入口：asset 失败时自动回退到 Blob 通道，调用方不用关心平台差异
export async function decodePageImage(imgEl, pageObj, options = {}) {
  const url = await ensurePageUrlLoaded(pageObj);
  if (!url) return false;
  if (await decodeImgIntoElement(imgEl, url, pageObj, options)) return true;
  const fallback = await ensurePageUrlLoaded(pageObj);
  if (!fallback || fallback === url) return false;
  return decodeImgIntoElement(imgEl, fallback, pageObj, options);
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
function splitPlainTextParagraph(text, measurer, maxHeight) {
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
  while (start < text.length) {
    const remaining = text.length - start;
    let guess = Math.max(1, Math.min(remaining, Math.round(remaining * maxHeight / fullHeight)));
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
  }
  return parts;
}

export function splitLongParagraph(html, measurer, maxHeight) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const source = wrapper.firstElementChild;
  if (!source || source.tagName !== 'P' || source.querySelector('img, svg, image')) return [html];

  if (source.children.length === 0) {
    const plainParts = splitPlainTextParagraph(source.textContent, measurer, maxHeight);
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

// 分页尺寸只依赖窗口、字号与单双页；抽出来给同步分页和增量分页共用。
function computeNovelMetrics(layoutConfig) {
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
  const cacheKey = [contentWidth, availableTextHeight, layoutConfig.fontSize, layoutConfig.spread].join('|');
  return { contentWidth, availableTextHeight, cacheKey };
}

export function getNovelPaginationKey(layoutConfig) {
  return computeNovelMetrics(layoutConfig).cacheKey;
}

// 单章分页：返回这一章切出来的所有页，不写页面序号（由 paginator 统一编号）。
function paginateNovelChapter(chap, chapterIndex, measurer, availableTextHeight) {
  const title = chap.title || `第 ${chapterIndex + 1} 章`;
  const blocks = collectNovelBlocks(chap.htmlContent);
  const chapterPages = [];

  if (blocks.length === 0) {
    chapterPages.push({
      title,
      html: '<p>（本章无正文内容）</p>',
      chapterIndex
    });
    return chapterPages;
  }

  let currentPageParts = [];
  measurer.innerHTML = '';

  const flushCurrentPage = () => {
    const currentPageHtml = currentPageParts.join('');
    if (currentPageHtml.trim()) {
      chapterPages.push({
        title,
        html: currentPageHtml,
        chapterIndex
      });
    }
    currentPageParts = [];
    measurer.innerHTML = '';
  };

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const blk = blocks[bIdx];
    const previousChildCount = measurer.childNodes.length;
    measurer.insertAdjacentHTML('beforeend', blk.html);

    if (measureBlockHeight(measurer) <= availableTextHeight) {
      currentPageParts.push(blk.html);
    } else {
      // 只移除刚测高的块，避免每加一段都重新解析整页 HTML。
      while (measurer.childNodes.length > previousChildCount && measurer.lastChild) {
        measurer.lastChild.remove();
      }
      if (currentPageParts.length) flushCurrentPage();
      measurer.innerHTML = blk.html;
      const parts = measureBlockHeight(measurer) > availableTextHeight ? splitLongParagraph(blk.html, measurer, availableTextHeight) : [blk.html];
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        measurer.innerHTML = part;
        if (index < parts.length - 1) {
          chapterPages.push({
            title,
            html: part,
            chapterIndex
          });
        } else {
          currentPageParts = [part];
          if (measureBlockHeight(measurer) > availableTextHeight) flushCurrentPage();
        }
      }
    }
  }
  flushCurrentPage();
  return chapterPages;
}

// 增量分页器：先测当前章节，其余章节在后台按片补齐。
// 未测章节用「整章一页」占位，保证补页期间目录、页码和阅读位置仍然有效。
export function createNovelPaginator(book, layoutConfig, measurer) {
  const chapters = book.chapters || [];
  const metrics = computeNovelMetrics(layoutConfig);
  const cached = novelPageCache.get(book);
  if (cached && cached.key === metrics.cacheKey && cached.chapters === book.chapters) {
    return {
      complete: true,
      cacheKey: metrics.cacheKey,
      pages: cached.pages,
      totalChapters: chapters.length,
      paginateChapter() {},
      buildPages() { return cached.pages; },
      isComplete() { return true; },
      commitCache() { return cached.pages; }
    };
  }

  measurer.style.width = metrics.contentWidth + 'px';
  measurer.style.fontSize = layoutConfig.fontSize + 'px';
  measurer.innerHTML = '';

  const chapterPages = new Array(chapters.length);
  let completedChapters = 0;

  function paginateChapter(chapterIndex) {
    if (chapterPages[chapterIndex]) return chapterPages[chapterIndex];
    const pages = paginateNovelChapter(chapters[chapterIndex] || {}, chapterIndex, measurer, metrics.availableTextHeight);
    chapterPages[chapterIndex] = pages;
    completedChapters++;
    return pages;
  }

  function buildPages({ provisional = false } = {}) {
    const list = [];
    for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
      const chapterPageList = chapterPages[cIdx];
      if (chapterPageList) {
        for (const page of chapterPageList) {
          list.push({
            pageNumber: list.length + 1,
            title: page.title,
            html: page.html,
            chapterIndex: page.chapterIndex
          });
        }
      } else if (provisional) {
        const chap = chapters[cIdx] || {};
        list.push({
          pageNumber: list.length + 1,
          title: chap.title || `第 ${cIdx + 1} 章`,
          html: chap.htmlContent || '<p>（本章无正文内容）</p>',
          chapterIndex: cIdx,
          provisional: true
        });
      }
    }
    return list;
  }

  function isComplete() {
    return completedChapters === chapters.length;
  }

  function commitCache() {
    const pages = buildPages();
    novelPageCache.set(book, { key: metrics.cacheKey, chapters: book.chapters, pages });
    measurer.innerHTML = '';
    return pages;
  }

  return {
    complete: false,
    cacheKey: metrics.cacheKey,
    totalChapters: chapters.length,
    paginateChapter,
    buildPages,
    isComplete,
    commitCache
  };
}

export function buildActivePages(book, layoutConfig, measurer) {
  if (book.type === 'manga') {
    return (book.pageItems || []).map((item, idx) => ({
      pageNumber: idx + 1,
      itemRef: item,
      imageWidth: item.imageWidth || 0,
      imageHeight: item.imageHeight || 0
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

  const paginator = createNovelPaginator(book, layoutConfig, measurer);
  if (paginator.complete) return paginator.pages;
  for (let cIdx = 0; cIdx < paginator.totalChapters; cIdx++) {
    paginator.paginateChapter(cIdx);
  }
  const pages = paginator.commitCache();
  measurer.innerHTML = '';
  return pages;
}
