/* ============================================================================
   HOMURA · 阅读器控制
   ----------------------------------------------------------------------------
   打开 / 关闭书籍，方向、双页、字号、条漫宽度等排版设置，翻页、滚轮、
   键盘与工具栏状态。
   ========================================================================== */

import { state, showToast, updateToolbarHighlight, toggleFullScreen } from './core.js';
import { renderBookshelf } from './bookshelf.js';
import { hydrateBook } from './restore.js';
import { buildActivePagesForBook, ensureChapterImagesResolved, recalculateNovelPaginationAndRender } from './pagination.js';
import { renderReaderViewport } from './renderer.js';
import { applyRestoredProgress, scheduleProgressSave, flushProgress } from './progress.js';

const LAYOUT_DIRECTIONS = ['ltr', 'rtl', 'vertical'];
const WEBTOON_FITS = ['screen', 'medium', 'wide'];
const WEBTOON_FIT_LABELS = { screen: '完整单张', medium: '适中宽幅', wide: '超宽满屏' };

// 打开书籍时恢复这本书上次的排版；没有存档的书沿用当前全局设置
function applyLayoutForBook(book) {
  const rec = state.progressMap[book.id];
  const saved = rec && rec.layout;
  if (!saved) return;

  const config = state.layoutConfig;
  if (LAYOUT_DIRECTIONS.includes(saved.direction)) config.direction = saved.direction;
  if (saved.spread === 1 || saved.spread === 2) config.spread = saved.spread;
  if (typeof saved.coverOffset === 'boolean') config.coverOffset = saved.coverOffset;
  if (typeof saved.fontSize === 'number') config.fontSize = Math.min(28, Math.max(14, saved.fontSize));
  if (WEBTOON_FITS.includes(saved.webtoonFit)) config.webtoonFit = saved.webtoonFit;

  // 工具栏上的文字标签同步，避免显示和真实设置不一致
  const fontLabel = document.getElementById('fontSizeLabel');
  if (fontLabel) fontLabel.innerText = config.fontSize;
  const offsetLabel = document.getElementById('coverOffsetStatus');
  if (offsetLabel) offsetLabel.innerText = config.coverOffset ? '开' : '关';
  const fitLabel = document.getElementById('webtoonFitStatus');
  if (fitLabel) fitLabel.innerText = WEBTOON_FIT_LABELS[config.webtoonFit];
}


export async function openBook(id) {
  const book = state.library.find(b => b.id === id);
  if (!book) return;

  // 从本地存档恢复的书只有元数据，第一次点开时才去取源文件
  if (book.restored) {
    const ok = await hydrateBook(book);
    if (!ok) return;
    renderBookshelf();
  }

  state.currentBook = book;
  state.currentIndex = 0;
  state.currentStageModeKey = '';
  state.activeBufferSlot = 0;
  // 先恢复这本书的排版，后续分页与恢复位置都按这套设置计算
  applyLayoutForBook(book);

  document.getElementById('readerTitle').innerText = book.title;
  document.getElementById('readerModal').classList.remove('hidden');
  // 阅读器是全屏遮罩，锁住底层书架页的滚动，避免右侧多出无用的长滚动条
  document.body.classList.add('overflow-hidden');

  const fontCtrl = document.getElementById('novelFontControls');
  if (book.type === 'manga') {
    fontCtrl.classList.add('hidden');
    fontCtrl.classList.remove('sm:flex');
    buildActivePagesForBook(book);
    const resumed = applyRestoredProgress(book);
    renderReaderViewport('none');
    if (resumed) showToast(`已回到上次阅读位置 · 第 ${state.currentIndex + 1} / ${state.activePages.length} 页`);
  } else {
    fontCtrl.classList.remove('hidden');
    fontCtrl.classList.add('sm:flex');
    if (book.zipContent && book.chapters) {
      for (const chap of book.chapters) {
        await ensureChapterImagesResolved(chap, book);
      }
    }
    buildActivePagesForBook(book);
    const resumed = applyRestoredProgress(book);
    renderReaderViewport('none');
    if (resumed) showToast(`已回到上次阅读位置 · 第 ${state.currentIndex + 1} / ${state.activePages.length} 页`);
  }
}

export function closeReader() {
  // 关闭前把防抖窗口内尚未落盘的位置补写一次，此时 currentBook 仍然有效
  flushProgress();
  if (state.webtoonObserver) {
    state.webtoonObserver.disconnect();
    state.webtoonObserver = null;
  }
  clearTimeout(state.preloadTimer);
  document.getElementById('readerModal').classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
  state.currentBook = null;
  state.currentStageModeKey = '';
  // 回到书架时重绘一次，让刚记录的进度立刻显示在卡片上
  renderBookshelf();
}

export function setDirection(dir) {
  const prevDir = state.layoutConfig.direction;
  state.layoutConfig.direction = dir;
  if (dir === 'rtl') {
    state.layoutConfig.rtlInvertButtons = true;
  }
  if (state.currentBook && state.currentBook.type !== 'manga' && (prevDir === 'vertical' || dir === 'vertical')) {
    recalculateNovelPaginationAndRender();
  } else {
    renderReaderViewport('fade');
  }
}

export function setSpreadCount(count) {
  state.layoutConfig.spread = count;
  if (state.layoutConfig.direction === 'vertical') {
    state.layoutConfig.direction = 'ltr';
  }
  if (state.currentBook && state.currentBook.type !== 'manga') {
    recalculateNovelPaginationAndRender();
  } else {
    renderReaderViewport('fade');
  }
}

export function toggleCoverOffset() {
  state.layoutConfig.coverOffset = !state.layoutConfig.coverOffset;
  document.getElementById('coverOffsetStatus').innerText = state.layoutConfig.coverOffset ? '开' : '关';
  renderReaderViewport('fade');
}

export function toggleWebtoonWidth() {
  const order = WEBTOON_FITS;
  const labels = WEBTOON_FIT_LABELS;
  const nextIdx = (order.indexOf(state.layoutConfig.webtoonFit) + 1) % order.length;
  state.layoutConfig.webtoonFit = order[nextIdx];
  document.getElementById('webtoonFitStatus').innerText = labels[state.layoutConfig.webtoonFit];
  state.currentStageModeKey = '';
  renderReaderViewport('none');
  showToast('条漫显示尺寸：' + labels[state.layoutConfig.webtoonFit]);
}

export function changeFontSize(delta) {
  state.layoutConfig.fontSize = Math.min(28, Math.max(14, state.layoutConfig.fontSize + delta));
  document.getElementById('fontSizeLabel').innerText = state.layoutConfig.fontSize;
  if (state.currentBook && state.currentBook.type !== 'manga') {
    recalculateNovelPaginationAndRender();
  }
}

export function getSpreadPair(index) {
  const total = state.activePages.length;
  if (total === 0) return [];
  const clamped = Math.max(0, Math.min(total - 1, index));

  if (state.layoutConfig.spread === 1) {
    return [state.activePages[clamped]];
  }

  if (state.layoutConfig.coverOffset && clamped === 0) {
    return [state.activePages[0]];
  }

  let pairStart = clamped;
  if (state.layoutConfig.coverOffset) {
    if (pairStart % 2 === 0) pairStart -= 1;
  } else {
    if (pairStart % 2 === 1) pairStart -= 1;
  }

  const firstPage = state.activePages[pairStart];
  const secondPage = pairStart + 1 < total ? state.activePages[pairStart + 1] : null;
  return secondPage ? [firstPage, secondPage] : [firstPage];
}

function getStepSizeForNext() {
  if (state.layoutConfig.spread === 1) return 1;
  if (state.layoutConfig.coverOffset && state.currentIndex === 0) return 1;
  return 2;
}

function getStepSizeForPrev() {
  if (state.layoutConfig.spread === 1) return 1;
  if (state.layoutConfig.coverOffset && state.currentIndex === 1) return 1;
  return 2;
}

export function goNextPage() {
  if (!state.currentBook) return;
  if (state.layoutConfig.direction === 'vertical') {
    const container = document.getElementById('verticalScrollContainer');
    if (container) container.scrollBy({ top: container.clientHeight * 0.88, behavior: 'smooth' });
    return;
  }
  const step = getStepSizeForNext();
  // In LTR, Next page slides in from Right ('enter-from-right').
  // In Japanese RTL, Next page slides in from Left ('enter-from-left').
  const slideDir = state.layoutConfig.direction === 'rtl' ? 'enter-from-left' : 'enter-from-right';

  if (state.currentIndex + step < state.activePages.length) {
    state.currentIndex += step;
    renderReaderViewport(slideDir);
  } else if (state.currentIndex < state.activePages.length - 1) {
    state.currentIndex = state.activePages.length - 1;
    renderReaderViewport(slideDir);
  } else {
    showToast('已经是最后一页了');
  }
}

export function goPrevPage() {
  if (!state.currentBook) return;
  if (state.layoutConfig.direction === 'vertical') {
    const container = document.getElementById('verticalScrollContainer');
    if (container) container.scrollBy({ top: -container.clientHeight * 0.88, behavior: 'smooth' });
    return;
  }
  const step = getStepSizeForPrev();
  const slideDir = state.layoutConfig.direction === 'rtl' ? 'enter-from-right' : 'enter-from-left';

  if (state.currentIndex - step >= 0) {
    state.currentIndex -= step;
    renderReaderViewport(slideDir);
  } else if (state.currentIndex > 0) {
    state.currentIndex = 0;
    renderReaderViewport(slideDir);
  } else {
    showToast('已经是第一页了');
  }
}

export function isNavigationInverted() {
  return state.layoutConfig.direction === 'rtl' && state.layoutConfig.rtlInvertButtons;
}

export function toggleRtlTapInvert() {
  if (state.layoutConfig.direction !== 'rtl') {
    showToast('当前为左→右模式，支持鼠标滚轮直接翻页');
    return;
  }
  state.layoutConfig.rtlInvertButtons = !state.layoutConfig.rtlInvertButtons;
  renderReaderViewport('none');
  showToast(state.layoutConfig.rtlInvertButtons ? '已切换：左边是下一页 (日漫原生手势)' : '已切换：右边是下一页');
}

export function onLeftButtonClick() {
  if (isNavigationInverted()) goNextPage();
  else goPrevPage();
}

export function onRightButtonClick() {
  if (isNavigationInverted()) goPrevPage();
  else goNextPage();
}

export function onSliderInput(val) {
  state.currentIndex = parseInt(val, 10) || 0;
  if (state.layoutConfig.direction === 'vertical') {
    const targetEl = document.getElementById('webtoon-page-' + state.currentIndex);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    document.getElementById('pageIndicatorLeft').innerText = `${state.currentIndex + 1} / ${state.activePages.length}`;
    scheduleProgressSave();
    return;
  }
  renderReaderViewport('fade');
}

// Mouse Wheel Page Turn Support
document.getElementById('readerViewport').addEventListener('wheel', e => {
  if (!state.currentBook || document.getElementById('readerModal').classList.contains('hidden')) return;
  if (state.layoutConfig.direction === 'vertical') return;

  e.preventDefault();
  const now = Date.now();
  if (now - state.lastWheelTurnTime < 190) return;

  if (Math.abs(e.deltaY) > 10) {
    state.lastWheelTurnTime = now;
    if (e.deltaY > 0) {
      goNextPage();
    } else {
      goPrevPage();
    }
  } else if (Math.abs(e.deltaX) > 15) {
    state.lastWheelTurnTime = now;
    if (e.deltaX > 0) {
      onRightButtonClick();
    } else {
      onLeftButtonClick();
    }
  }
}, { passive: false });

// Keyboard Shortcuts
window.addEventListener('keydown', e => {
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleFullScreen();
    return;
  }

  if (!state.currentBook || document.getElementById('readerModal').classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    onLeftButtonClick();
  } else if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    onRightButtonClick();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    goNextPage();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    goPrevPage();
  } else if (e.key === 'Escape') {
    closeReader();
  }
});

// 全屏状态变化：更新按钮文案，小说重新分页
document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  const textEl = document.getElementById('fullscreenText');
  if (textEl) textEl.innerText = isFs ? '退出 (F)' : 'F 全屏';
  if (state.currentBook && state.currentBook.type !== 'manga') {
    recalculateNovelPaginationAndRender();
  }
});
