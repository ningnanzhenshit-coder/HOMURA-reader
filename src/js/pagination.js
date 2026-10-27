/* ============================================================================
   HOMURA · 页面资源与小说分页
   ----------------------------------------------------------------------------
   按需生成图片 URL、解码图片，并把长章节按当前窗口与字号切成整屏书页。
   ========================================================================== */

import { state } from './core.js';
import { escapeHtml } from './bookshelf.js';
import { renderReaderViewport } from './renderer.js';


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

export function buildActivePagesForBook(book) {
  if (book.type === 'manga') {
    state.activePages = (book.pageItems || []).map((item, idx) => ({
      pageNumber: idx + 1,
      itemRef: item
    }));
    return;
  }

  if (state.layoutConfig.direction === 'vertical') {
    state.activePages = (book.chapters || []).map((chap, idx) => ({
      pageNumber: idx + 1,
      title: chap.title || `第 ${idx + 1} 节`,
      html: chap.htmlContent,
      chapterIndex: idx
    }));
    return;
  }

  const measurer = document.getElementById('novelPaginationMeasurer');
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;

  const isDouble = state.layoutConfig.spread === 2 && vw >= 768;
  const cardOuterWidth = isDouble
    ? Math.min(540, Math.floor((vw - 64) / 2))
    : Math.min(672, vw - 32);
  const cardHorizontalPadding = vw >= 640 ? 80 : 48;
  const contentWidth = Math.max(220, cardOuterWidth - cardHorizontalPadding);
  const availableTextHeight = Math.max(180, vh - 92 - 175);

  measurer.style.width = contentWidth + 'px';
  measurer.style.fontSize = state.layoutConfig.fontSize + 'px';
  measurer.innerHTML = '';

  const paginatedList = [];
  const chapters = book.chapters || [];

  for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
    const chap = chapters[cIdx];
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = chap.htmlContent || '';

    const blocks = [];
    Array.from(tempContainer.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent.trim();
        if (txt) blocks.push({ type: 'p', text: txt, html: `<p>${escapeHtml(txt)}</p>` });
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (['div', 'section', 'article', 'body'].includes(tag) && node.children.length > 0 && !node.querySelector('img, svg, image')) {
          Array.from(node.children).forEach(child => {
            blocks.push({ type: child.tagName.toLowerCase(), text: child.textContent.trim(), html: child.outerHTML });
          });
        } else {
          blocks.push({ type: tag, text: node.textContent.trim(), html: node.outerHTML });
        }
      }
    });

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
        if (!prevHtml && blk.text.length > 80 && !blk.html.includes('<img')) {
          const sentences = blk.text.match(/[^。！？!?]+[。！？!?”]*/g) || [blk.text];
          let subParaText = '';
          for (const sent of sentences) {
            const testPara = `<p>${escapeHtml(subParaText + sent)}</p>`;
            measurer.innerHTML = currentPageHtml + testPara;
            if (measurer.scrollHeight <= availableTextHeight) {
              subParaText += sent;
            } else {
              if (subParaText) {
                currentPageHtml += `<p>${escapeHtml(subParaText)}</p>`;
                flushCurrentPage();
                subParaText = sent;
              } else {
                currentPageHtml += testPara;
                flushCurrentPage();
                subParaText = '';
              }
            }
          }
          if (subParaText) {
            currentPageHtml += `<p>${escapeHtml(subParaText)}</p>`;
            measurer.innerHTML = currentPageHtml;
          }
        } else {
          if (prevHtml) {
            flushCurrentPage();
          }
          currentPageHtml = blk.html;
          measurer.innerHTML = currentPageHtml;
          if (measurer.scrollHeight > availableTextHeight) {
            flushCurrentPage();
          }
        }
      }
    }
    flushCurrentPage();
  }

  measurer.innerHTML = '';
  state.activePages = paginatedList.map((item, idx) => ({
    pageNumber: idx + 1,
    title: item.title,
    html: item.html,
    chapterIndex: item.chapterIndex
  }));
}

export async function recalculateNovelPaginationAndRender() {
  if (!state.currentBook || state.currentBook.type === 'manga') return;
  const oldTotal = Math.max(1, state.activePages.length);
  const progressRatio = state.currentIndex / oldTotal;

  if (state.currentBook.zipContent && state.currentBook.chapters) {
    for (const chap of state.currentBook.chapters) {
      await ensureChapterImagesResolved(chap, state.currentBook);
    }
  }

  buildActivePagesForBook(state.currentBook);
  state.currentIndex = Math.min(state.activePages.length - 1, Math.max(0, Math.round(progressRatio * state.activePages.length)));
  state.currentStageModeKey = '';
  renderReaderViewport('none');
}

// 窗口尺寸变化：小说重新分页（漫画与条漫不重排）
window.addEventListener('resize', () => {
  if (!state.currentBook || state.currentBook.type === 'manga' || state.layoutConfig.direction === 'vertical') return;
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(() => {
    recalculateNovelPaginationAndRender();
  }, 180);
});
