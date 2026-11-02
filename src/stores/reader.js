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
import { ref, shallowRef, reactive, computed, nextTick } from 'vue';
import { useShelfStore } from './shelf.js';
import { hydrateBook } from '../services/restore.js';
import { buildActivePages, ensureChapterImagesResolved } from '../services/pagination.js';
import { applyRestoredProgress, scheduleProgressSave, flushProgress } from '../services/progress.js';
import { collectionReadingOrder, adjacentCollectionBook, spreadBounds } from '../services/collectionReading.js';

const LAYOUT_DIRECTIONS = ['ltr', 'rtl', 'vertical'];
const WEBTOON_FITS = ['screen', 'medium', 'wide'];
export const WEBTOON_FIT_LABELS = { screen: '完整单张', medium: '适中宽幅', wide: '超宽满屏' };
export const NOVEL_FONT_MIN = 12;
export const NOVEL_FONT_MAX = 48;

export const useReaderStore = defineStore('reader', () => {
  const currentBook = shallowRef(null);
  const shelf = useShelfStore();
  const openingBook = ref(false);
  const openError = ref('');
  const readingCollectionId = ref(null);
  const collectionOrderIds = shallowRef([]);
  const webtoonBounds = shallowRef({ atStart: true, atEnd: false });
  let openRequestToken = 0;
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
  // 窄屏（<768）强制按单页渲染：双页并排在小屏上不可读
  const effectiveDouble = ref(false);

  const DOUBLE_SPREAD_MIN_WIDTH = 768;

  // 排版配置（纯数据，可安全响应式）
  const layoutConfig = reactive({
    direction: 'ltr',          // 'ltr' | 'rtl' | 'vertical'
    spread: 2,                 // 1 | 2
    coverOffset: true,
    fontSize: 18,
    rtlInvertButtons: true,    // 日漫右→左模式下默认「左边是下一页」
    webtoonFit: 'screen'       // 'screen' | 'medium' | 'wide'
  });

  const currentCollection = computed(() => currentBook.value ? shelf.collections.find(item => item.bookIds.includes(currentBook.value.id)) || null : null);
  const collectionBooks = computed(() => {
    const collection = currentCollection.value;
    if (!collection) return [];
    const books = shelf.booksInCollection(collection.id);
    return collectionReadingOrder(books, readingCollectionId.value === collection.id ? collectionOrderIds.value : []);
  });
  const previousCollectionBook = computed(() => adjacentCollectionBook(collectionBooks.value, currentBook.value?.id, -1));
  const nextCollectionBook = computed(() => adjacentCollectionBook(collectionBooks.value, currentBook.value?.id, 1));
  const atFirstPage = computed(() => layoutConfig.direction === 'vertical' ? webtoonBounds.value.atStart : spreadBounds(currentIndex.value, activePages.value.length, effectiveDouble.value, layoutConfig.coverOffset).start === 0);
  const atLastPage = computed(() => layoutConfig.direction === 'vertical' ? webtoonBounds.value.atEnd : activePages.value.length > 0 && spreadBounds(currentIndex.value, activePages.value.length, effectiveDouble.value, layoutConfig.coverOffset).end === activePages.value.length - 1);

  // ---- 纯派生逻辑（原 reader.js 的查询函数） ----

  function canUseDoubleSpread() {
    return layoutConfig.spread === 2 && (typeof window === 'undefined' || window.innerWidth >= DOUBLE_SPREAD_MIN_WIDTH);
  }

  // 同步「当前实际是否双页」，供顶栏状态与窗口尺寸变化判断复用
  function syncEffectiveSpread() {
    effectiveDouble.value = canUseDoubleSpread();
    return effectiveDouble.value;
  }

  function getSpreadPair(index) {
    const bounds = spreadBounds(index, activePages.value.length, syncEffectiveSpread(), layoutConfig.coverOffset);
    return activePages.value.slice(bounds.start, bounds.end + 1);
  }

  function getStepSizeForNext() {
    if (!syncEffectiveSpread()) return 1;
    if (layoutConfig.coverOffset && currentIndex.value === 0) return 1;
    return 2;
  }

  function getStepSizeForPrev() {
    if (!syncEffectiveSpread()) return 1;
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
    const next = { ...layoutConfig };
    // PDF 版式固定、字号小，双页并排会挤成一团：首次打开默认单页
    if (!saved) {
      if (book.format === 'pdf') next.spread = 1;
      return next;
    }

    if (LAYOUT_DIRECTIONS.includes(saved.direction)) next.direction = saved.direction;
    if (saved.spread === 1 || saved.spread === 2) next.spread = saved.spread;
    if (typeof saved.coverOffset === 'boolean') next.coverOffset = saved.coverOffset;
    if (Number.isFinite(saved.fontSize)) next.fontSize = Math.min(NOVEL_FONT_MAX, Math.max(NOVEL_FONT_MIN, saved.fontSize));
    if (WEBTOON_FITS.includes(saved.webtoonFit)) next.webtoonFit = saved.webtoonFit;
    return next;
  }

  async function openBook(id, options = {}) {
    const book = shelf.library.find(b => b.id === id);
    if (!book) return false;
    const token = ++openRequestToken;
    openingBook.value = true;
    openError.value = '';
    try {
      if (book.restored) {
        if (!(await hydrateBook(book))) throw new Error('本地存档无法读取，请重新导入');
        if (token !== openRequestToken) return false;
        shelf.touchBook(book);
      }
      if (book.type !== 'manga' && book.zipContent && book.chapters) {
        for (const chap of book.chapters) {
          await ensureChapterImagesResolved(chap, book);
          if (token !== openRequestToken) return false;
        }
      }
      const nextLayout = applyLayoutForBook(book);
      const pages = buildActivePages(book, nextLayout, measurerEl.value);
      if (!pages.length) throw new Error('没有可阅读的页面');
      const collection = shelf.collections.find(item => item.bookIds.includes(id));
      // 固定进入阅读器时的顺序，防止“最近阅读”时间更新后前后本突然重排。
      const order = options.preserveCollectionOrder && collection?.id === currentCollection.value?.id
        ? collectionBooks.value.map(item => item.id)
        : collection ? shelf.booksInCollection(collection.id).map(item => item.id) : [];
      if (currentBook.value && currentBook.value.id !== id) {
        const snapshot = progressSnapshot();
        if (options.finishCurrent) snapshot.currentIndex = Math.max(0, snapshot.activePages.length - 1);
        await flushProgress(snapshot, shelf);
      }
      if (token !== openRequestToken) return false;
      clearTimeout(preloadTimer.value);
      clearTimeout(resizeTimer.value);
      renderToken.value++;
      webtoonObserver.value?.disconnect();
      webtoonObserver.value = null;
      activeTransitionAnims.value.forEach(animation => { try { animation.cancel(); } catch (err) {} });
      activeTransitionAnims.value = [];
      const restoredIdx = applyRestoredProgress(book, pages, shelf.progressMap);
      Object.assign(layoutConfig, nextLayout);
      activePages.value = pages;
      currentIndex.value = options.position === 'end' ? pages.length - 1 : options.position === 'start' ? 0 : Math.max(0, restoredIdx);
      effectiveDouble.value = canUseDoubleSpread();
      readingCollectionId.value = collection?.id || null;
      collectionOrderIds.value = order;
      webtoonBounds.value = { atStart: currentIndex.value === 0, atEnd: false };
      currentBook.value = book;
      // 先让旧翻页组件卸载、新组件接管渲染入口，再绘制目标书，避免旧缓冲串页。
      await nextTick();
      if (token !== openRequestToken) return false;
      requestRender('none');
      return true;
    } catch (err) {
      if (token === openRequestToken) {
        openError.value = `无法打开《${book.title}》：${err.message || '请检查本地存档'}`;
        console.warn('[HOMURA] 打开书本失败', err);
      }
      return false;
    } finally {
      if (token === openRequestToken) openingBook.value = false;
    }
  }

  function clearOpenError() { openError.value = ''; }

  function openAdjacentCollectionBook(direction) {
    if (openingBook.value) return;
    const target = direction > 0 ? nextCollectionBook.value : previousCollectionBook.value;
    if (!target) return;
    return openBook(target.id, { position: direction > 0 ? 'start' : 'end', preserveCollectionOrder: true, finishCurrent: direction > 0 });
  }

  function openCollectionBook(id) {
    if (!collectionBooks.value.some(book => book.id === id)) return Promise.resolve(false);
    if (id === currentBook.value?.id) return Promise.resolve(true);
    return openBook(id, { preserveCollectionOrder: true });
  }

  function closeReader() {
    openRequestToken++;
    openingBook.value = false;
    openError.value = '';
    readingCollectionId.value = null;
    collectionOrderIds.value = [];
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
    touchProgress();
  }

  // 窗口尺寸 / 视口高度变化：漫画只在单双页档位变化时重渲染，小说则重新分页
  function handleViewportChange() {
    if (!currentBook.value || layoutConfig.direction === 'vertical') return;
    clearTimeout(resizeTimer.value);
    resizeTimer.value = setTimeout(() => {
      if (!currentBook.value || layoutConfig.direction === 'vertical') return;
      if (currentBook.value.type === 'manga') {
        const next = canUseDoubleSpread();
        if (next !== effectiveDouble.value) {
          effectiveDouble.value = next;
          requestRender('none');
        }
      } else {
        recalculateNovelPaginationAndRender();
      }
    }, 180);
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

  function setFontSize(value) {
    if (!currentBook.value || currentBook.value.type === 'manga' || !Number.isFinite(Number(value))) return;
    const size = Math.min(NOVEL_FONT_MAX, Math.max(NOVEL_FONT_MIN, Math.round(Number(value))));
    if (size === layoutConfig.fontSize) return;
    layoutConfig.fontSize = size;
    recalculateNovelPaginationAndRender();
  }

  function changeFontSize(delta) {
    setFontSize(layoutConfig.fontSize + delta);
  }

  async function setCustomCover(file) {
    const id = currentBook.value?.id;
    if (!id) return;
    const book = await shelf.setBookCover(id, file);
    if (book && currentBook.value?.id === id) currentBook.value = { ...currentBook.value, cover: book.cover, customCoverBlob: book.customCoverBlob };
  }

  // ---- 翻页 ----

  function goNextPage() {
    if (!currentBook.value || openingBook.value) return;
    if (currentCollection.value && atLastPage.value) return openAdjacentCollectionBook(1);
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
    }
  }

  function goPrevPage() {
    if (!currentBook.value || openingBook.value) return;
    if (currentCollection.value && atFirstPage.value) return openAdjacentCollectionBook(-1);
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
    }
  }

  function toggleRtlTapInvert() {
    if (layoutConfig.direction !== 'rtl') return;
    layoutConfig.rtlInvertButtons = !layoutConfig.rtlInvertButtons;
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
    currentCollection,
    collectionBooks,
    previousCollectionBook,
    nextCollectionBook,
    atFirstPage,
    atLastPage,
    webtoonBounds,
    openingBook,
    openError,
    clearOpenError,
    openCollectionBook,
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
    effectiveDouble,
    getSpreadPair,
    getStepSizeForNext,
    getStepSizeForPrev,
    isNavigationInverted,
    requestRender,
    touchProgress,
    openBook,
    closeReader,
    recalculateNovelPaginationAndRender,
    handleViewportChange,
    setDirection,
    setSpreadCount,
    toggleCoverOffset,
    setWebtoonFit,
    changeFontSize,
    setFontSize,
    setCustomCover,
    goNextPage,
    goPrevPage,
    toggleRtlTapInvert,
    onLeftButtonClick,
    onRightButtonClick,
    onSliderInput
  };
});
