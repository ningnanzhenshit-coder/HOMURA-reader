/* ============================================================================
   HOMURA · 阅读器 Store
   ----------------------------------------------------------------------------
   当前书籍 / 页码 / 双缓冲槽位 / 排版配置，以及全部翻页与排版动作。
   注意：含 DOM 引用、Animation、timer、zipContent 的字段一律 shallowRef，
   避免 Vue 深度代理拖慢动画帧、避免 Animation 对象被代理后 cancel 异常。
   渲染本体在 PaginatedView.vue / WebtoonView.vue 内直操作 ref DOM，
   二者挂载时把渲染 / 滚动函数注册到本 store（renderFn / webtoonScrollBy /
   webtoonScrollTo），store 动作只负责状态流转后触发对应函数。
   ========================================================================== */

import { defineStore } from 'pinia';
import { ref, shallowRef, reactive } from 'vue';
import { useShelfStore } from './shelf.js';
import { hydrateBook } from '../services/restore.js';
import { buildActivePages, ensureChapterImagesResolved } from '../services/pagination.js';
import { applyRestoredProgress, scheduleProgressSave, flushProgress } from '../services/progress.js';
import { showToast } from '../composables/useToast.js';

const LAYOUT_DIRECTIONS = ['ltr', 'rtl', 'vertical'];
const WEBTOON_FITS = ['screen', 'medium', 'wide'];
export const WEBTOON_FIT_LABELS = { screen: '完整单张', medium: '适中宽幅', wide: '超宽满屏' };

export const useReaderStore = defineStore('reader', () => {
  const currentBook = shallowRef(null);
  const currentIndex = ref(0);
  const activePages = shallowRef([]);
  const renderToken = ref(0);
  const webtoonObserver = shallowRef(null);
  const lastWheelTurnTime = ref(0);

  // Double-Buffer State for 60fps / 120fps Hardware-Accelerated Page Turning
  const currentStageModeKey = ref('');
  const activeBufferSlot = ref(0); // 0 = Buffer A, 1 = Buffer B
  const activeTransitionAnims = shallowRef([]);
  const preloadTimer = ref(null);
  const resizeTimer = ref(null);
  // App.vue 的 #novelPaginationMeasurer 隐藏 div，供智能分页实测 scrollHeight
  const measurerEl = shallowRef(null);

  // 组件挂载时注册的渲染 / 滚动入口（PaginatedView / WebtoonView）
  const renderFn = shallowRef(null);
  const webtoonScrollBy = shallowRef(null);
  const webtoonScrollTo = shallowRef(null);

  // 底栏页码与滑条位置由渲染函数回写，BottomBar 响应式读取
  const pageIndicator = ref('1 / 1');
  const sliderValue = ref(0);

  // 排版配置（纯数据，可安全响应式）
  const layoutConfig = reactive({
    direction: 'ltr',          // 'ltr' | 'rtl' | 'vertical'
    spread: 2,                 // 1 | 2
    coverOffset: true,
    fontSize: 18,
    rtlInvertButtons: true,    // 日漫右→左模式下默认「左边是下一页」
    webtoonFit: 'screen'       // 'screen' | 'medium' | 'wide'
  });

  // ---- 纯派生逻辑（原 reader.js 的查询函数） ----

  function getSpreadPair(index) {
    const total = activePages.value.length;
    if (total === 0) return [];
    const clamped = Math.max(0, Math.min(total - 1, index));

    if (layoutConfig.spread === 1) {
      return [activePages.value[clamped]];
    }

    if (layoutConfig.coverOffset && clamped === 0) {
      return [activePages.value[0]];
    }

    let pairStart = clamped;
    if (layoutConfig.coverOffset) {
      if (pairStart % 2 === 0) pairStart -= 1;
    } else {
      if (pairStart % 2 === 1) pairStart -= 1;
    }

    const firstPage = activePages.value[pairStart];
    const secondPage = pairStart + 1 < total ? activePages.value[pairStart + 1] : null;
    return secondPage ? [firstPage, secondPage] : [firstPage];
  }

  function getStepSizeForNext() {
    if (layoutConfig.spread === 1) return 1;
    if (layoutConfig.coverOffset && currentIndex.value === 0) return 1;
    return 2;
  }

  function getStepSizeForPrev() {
    if (layoutConfig.spread === 1) return 1;
    if (layoutConfig.coverOffset && currentIndex.value === 1) return 1;
    return 2;
  }

  function isNavigationInverted() {
    return layoutConfig.direction === 'rtl' && layoutConfig.rtlInvertButtons;
  }

  // ---- 渲染触发：条漫模式由 WebtoonView 响应式自渲染，翻页模式调注册函数 ----

  function requestRender(transitionDir = 'fade') {
    if (layoutConfig.direction === 'vertical') return;
    const fn = renderFn.value;
    if (fn) fn(transitionDir);
  }

  // progress service 需要 reader 形状的对象；store 内部动作传快照，避免依赖 this
  function progressSnapshot() {
    return {
      currentBook: currentBook.value,
      activePages: activePages.value,
      currentIndex: currentIndex.value,
      layoutConfig
    };
  }

  function touchProgress() {
    const shelf = useShelfStore();
    scheduleProgressSave(progressSnapshot(), shelf);
  }

  // ---- 打开 / 关闭 ----

  // 打开书籍时恢复这本书上次的排版；没有存档的书沿用当前全局设置
  function applyLayoutForBook(book) {
    const shelf = useShelfStore();
    const rec = shelf.progressMap[book.id];
    const saved = rec && rec.layout;
    if (!saved) return;

    if (LAYOUT_DIRECTIONS.includes(saved.direction)) layoutConfig.direction = saved.direction;
    if (saved.spread === 1 || saved.spread === 2) layoutConfig.spread = saved.spread;
    if (typeof saved.coverOffset === 'boolean') layoutConfig.coverOffset = saved.coverOffset;
    if (typeof saved.fontSize === 'number') layoutConfig.fontSize = Math.min(28, Math.max(14, saved.fontSize));
    if (WEBTOON_FITS.includes(saved.webtoonFit)) layoutConfig.webtoonFit = saved.webtoonFit;
  }

  async function openBook(id) {
    const shelf = useShelfStore();
    const book = shelf.library.find(b => b.id === id);
    if (!book) return;

    // 从本地存档恢复的书只有元数据，第一次点开时才去取源文件
    if (book.restored) {
      const ok = await hydrateBook(book);
      if (!ok) return;
      shelf.touchBook(book);
    }

    currentBook.value = book;
    currentIndex.value = 0;
    // 先恢复这本书的排版，后续分页与恢复位置都按这套设置计算
    applyLayoutForBook(book);

    if (book.type !== 'manga' && book.zipContent && book.chapters) {
      for (const chap of book.chapters) {
        await ensureChapterImagesResolved(chap, book);
      }
    }

    activePages.value = buildActivePages(book, layoutConfig, measurerEl.value);
    const restoredIdx = applyRestoredProgress(book, activePages.value, shelf.progressMap);
    if (restoredIdx >= 0) {
      currentIndex.value = restoredIdx;
      showToast(`已回到上次阅读位置 · 第 ${restoredIdx + 1} / ${activePages.value.length} 页`);
    }
    // PaginatedView / WebtoonView 可能尚未挂载（Vue 在下个微任务才 patch），
    // 那时由组件 onMounted 自检 activePages 非空后自行首渲染
    requestRender('none');
  }

  function closeReader() {
    const shelf = useShelfStore();
    // 关闭前把防抖窗口内尚未落盘的位置补写一次，此时 currentBook 仍然有效
    flushProgress(progressSnapshot(), shelf);
    if (webtoonObserver.value) {
      webtoonObserver.value.disconnect();
      webtoonObserver.value = null;
    }
    clearTimeout(preloadTimer.value);
    currentBook.value = null;
    // 进度已通过 progressMap 响应式流回书架卡片，无需手动重绘书架
  }

  // ---- 排版设置 ----

  // 小说重排：保持阅读比例不变，按新窗口 / 字号 / 单双页重新切页
  function recalculateNovelPaginationAndRender() {
    const book = currentBook.value;
    if (!book || book.type === 'manga' || !measurerEl.value) return;
    const oldTotal = activePages.value.length;
    const ratio = oldTotal > 1 ? currentIndex.value / (oldTotal - 1) : 0;
    activePages.value = buildActivePages(book, layoutConfig, measurerEl.value);
    const lastIdx = Math.max(0, activePages.value.length - 1);
    currentIndex.value = Math.min(lastIdx, Math.max(0, Math.round(ratio * lastIdx)));
    requestRender('none');
  }

  function setDirection(dir) {
    const prevDir = layoutConfig.direction;
    layoutConfig.direction = dir;
    if (dir === 'rtl') {
      layoutConfig.rtlInvertButtons = true;
    }
    if (currentBook.value && currentBook.value.type !== 'manga' && (prevDir === 'vertical' || dir === 'vertical')) {
      recalculateNovelPaginationAndRender();
    } else {
      requestRender('fade');
    }
  }

  function setSpreadCount(count) {
    layoutConfig.spread = count;
    if (layoutConfig.direction === 'vertical') {
      layoutConfig.direction = 'ltr';
    }
    if (currentBook.value && currentBook.value.type !== 'manga') {
      recalculateNovelPaginationAndRender();
    } else {
      requestRender('fade');
    }
  }

  function toggleCoverOffset() {
    layoutConfig.coverOffset = !layoutConfig.coverOffset;
    requestRender('fade');
  }

  function setWebtoonFit(fit) {
    if (!WEBTOON_FITS.includes(fit) || layoutConfig.webtoonFit === fit) return;
    layoutConfig.webtoonFit = fit;
    // 条漫模式下 WebtoonView 通过 :class 绑定响应尺寸变化，无需重渲染
    requestRender('none');
  }

  function changeFontSize(delta) {
    layoutConfig.fontSize = Math.min(28, Math.max(14, layoutConfig.fontSize + delta));
    if (currentBook.value && currentBook.value.type !== 'manga') {
      recalculateNovelPaginationAndRender();
    }
  }

  // ---- 翻页 ----

  function goNextPage() {
    if (!currentBook.value) return;
    if (layoutConfig.direction === 'vertical') {
      if (webtoonScrollBy.value) webtoonScrollBy.value(1);
      return;
    }
    const step = getStepSizeForNext();
    // In LTR, Next page slides in from Right ('enter-from-right').
    // In Japanese RTL, Next page slides in from Left ('enter-from-left').
    const slideDir = layoutConfig.direction === 'rtl' ? 'enter-from-left' : 'enter-from-right';

    if (currentIndex.value + step < activePages.value.length) {
      currentIndex.value += step;
      requestRender(slideDir);
    } else if (currentIndex.value < activePages.value.length - 1) {
      currentIndex.value = activePages.value.length - 1;
      requestRender(slideDir);
    } else {
      showToast('已经是最后一页了');
    }
  }

  function goPrevPage() {
    if (!currentBook.value) return;
    if (layoutConfig.direction === 'vertical') {
      if (webtoonScrollBy.value) webtoonScrollBy.value(-1);
      return;
    }
    const step = getStepSizeForPrev();
    const slideDir = layoutConfig.direction === 'rtl' ? 'enter-from-right' : 'enter-from-left';

    if (currentIndex.value - step >= 0) {
      currentIndex.value -= step;
      requestRender(slideDir);
    } else if (currentIndex.value > 0) {
      currentIndex.value = 0;
      requestRender(slideDir);
    } else {
      showToast('已经是第一页了');
    }
  }

  function toggleRtlTapInvert() {
    if (layoutConfig.direction !== 'rtl') {
      showToast('当前为左→右模式，支持鼠标滚轮直接翻页');
      return;
    }
    layoutConfig.rtlInvertButtons = !layoutConfig.rtlInvertButtons;
    showToast(layoutConfig.rtlInvertButtons ? '已切换：左边是下一页 (日漫原生手势)' : '已切换：右边是下一页');
  }

  function onLeftButtonClick() {
    if (isNavigationInverted()) goNextPage();
    else goPrevPage();
  }

  function onRightButtonClick() {
    if (isNavigationInverted()) goPrevPage();
    else goNextPage();
  }

  function onSliderInput(val) {
    currentIndex.value = parseInt(val, 10) || 0;
    if (layoutConfig.direction === 'vertical') {
      if (webtoonScrollTo.value) webtoonScrollTo.value(currentIndex.value);
      pageIndicator.value = `${currentIndex.value + 1} / ${activePages.value.length}`;
      sliderValue.value = currentIndex.value;
      touchProgress();
      return;
    }
    requestRender('fade');
  }

  return {
    currentBook,
    currentIndex,
    activePages,
    renderToken,
    webtoonObserver,
    lastWheelTurnTime,
    currentStageModeKey,
    activeBufferSlot,
    activeTransitionAnims,
    preloadTimer,
    resizeTimer,
    measurerEl,
    renderFn,
    webtoonScrollBy,
    webtoonScrollTo,
    pageIndicator,
    sliderValue,
    layoutConfig,
    getSpreadPair,
    getStepSizeForNext,
    getStepSizeForPrev,
    isNavigationInverted,
    requestRender,
    touchProgress,
    openBook,
    closeReader,
    recalculateNovelPaginationAndRender,
    setDirection,
    setSpreadCount,
    toggleCoverOffset,
    setWebtoonFit,
    changeFontSize,
    goNextPage,
    goPrevPage,
    toggleRtlTapInvert,
    onLeftButtonClick,
    onRightButtonClick,
    onSliderInput
  };
});
