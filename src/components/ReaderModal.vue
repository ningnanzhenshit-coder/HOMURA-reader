<template>
  <!-- Reader Fullscreen Modal · 沉浸式：工具栏浮在画布上，默认自动隐藏 -->
  <div v-show="!!reader.currentBook" class="reader-dismiss-layer fixed inset-0 bg-[var(--bg-reader)] z-50 flex flex-col transition-colors duration-200">
    <div
      v-if="isCompact && !!reader.currentBook && !nativePredictiveBackSupported"
      class="reader-back-edge"
      aria-hidden="true"
      @pointerdown="onBackPointerDown"
      @pointermove="onBackPointerMove"
      @pointerup="onBackPointerUp"
      @pointercancel="onBackPointerCancel"
      @lostpointercapture="onBackPointerLostCapture"
    ></div>

    <div
      ref="viewportRef"
      class="relative flex-1 min-h-0 overflow-hidden select-text"
      @mousemove="onMouseMove"
      @click="onViewportClick"
      @pointerdown="onTouchStart"
      @pointerup="onTouchEnd"
    >
      <template v-if="reader.currentBook">
        <!-- 桌面打开设置侧栏时为正文留出 372px，避免被 sheet 遮挡 -->
        <div class="w-full h-full transition-[padding] duration-200" :style="columnReserveStyle">
          <WebtoonView
            v-if="reader.layoutConfig.direction === 'vertical'"
            :key="'webtoon-' + reader.currentBook.id"
          />
          <PaginatedView
            v-else
            :key="'paginated-' + reader.currentBook.type + '-' + reader.currentBook.id"
          />
        </div>
      </template>

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="-translate-y-3 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-3 opacity-0"
      >
        <ReaderTopBar
          v-if="ui.readerChromeVisible"
          class="absolute top-0 inset-x-0 z-30"
          @back="dismissWithPredictiveBack"
        />
      </Transition>

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-3 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-3 opacity-0"
      >
        <ReaderBottomBar v-if="ui.readerChromeVisible" class="absolute bottom-0 inset-x-0 z-30" />
      </Transition>

      <ReaderTocDrawer />
      <ReaderSettingsDrawer />
    </div>
  </div>
</template>

<script setup>
/* ============================================================================
   HOMURA · 阅读器整屏遮罩
   ----------------------------------------------------------------------------
   画布铺满窗口，顶部/底部工具栏以浮层形式出现并自动隐藏；
   鼠标靠近上/下边缘、点击画布或按 Esc 唤出，2.2 秒无操作淡出；
   触屏点中间区域切换工具栏，条漫模式轻点画布切换。
   设置与目录改为左右抽屉，不再占用顶栏。
   ========================================================================== */

import { ref, watch, computed, onBeforeUnmount } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';
import { useShortcuts } from '../composables/useShortcuts.js';
import { useReaderBackDismiss } from '../composables/useReaderBackDismiss.js';
import ReaderTopBar from './ReaderTopBar.vue';
import ReaderBottomBar from './ReaderBottomBar.vue';
import ReaderTocDrawer from './ReaderTocDrawer.vue';
import ReaderSettingsDrawer from './ReaderSettingsDrawer.vue';
import PaginatedView from './PaginatedView.vue';
import WebtoonView from './WebtoonView.vue';

const reader = useReaderStore();
const ui = useUiStore();
const { isTouch, isCompact } = useViewport();
const viewportRef = ref(null);
const {
  onPointerDown: onBackPointerDown,
  onPointerMove: onBackPointerMove,
  onPointerUp: onBackPointerUp,
  onPointerCancel: onBackPointerCancel,
  onPointerLostCapture: onBackPointerLostCapture,
  dismissWithPredictiveBack,
  nativePredictiveBackSupported
} = useReaderBackDismiss(reader, ui);

// 桌面设置侧栏宽度 372px：开启时为正文列预留空间
const columnReserveStyle = computed(() =>
  ui.settingsOpen && !isCompact.value ? { paddingRight: '372px' } : null
);

// 桌面：鼠标贴近上下边缘唤出工具栏；工具栏可见时，移动鼠标会重新计时
function onMouseMove(e) {
  if (!reader.currentBook) return;
  const nearEdge = e.clientY <= 72 || e.clientY >= window.innerHeight - 72;
  if (nearEdge || ui.readerChromeVisible) ui.showChrome();
}

// 桌面点击画布唤出工具栏；触屏交给手势层 / 轻点逻辑处理
function onViewportClick() {
  if (isTouch.value) return;
  ui.showChrome();
}

// 条漫模式没有 PaginatedView 手势层，这里用「轻点不移动」切换工具栏
const tapInfo = { x: 0, y: 0, t: 0 };

function onTouchStart(e) {
  if (e.pointerType === 'mouse' || reader.layoutConfig.direction !== 'vertical') return;
  if (ui.settingsOpen || ui.tocOpen) return;
  tapInfo.x = e.clientX;
  tapInfo.y = e.clientY;
  tapInfo.t = Date.now();
}

function onTouchEnd(e) {
  if (e.pointerType === 'mouse' || reader.layoutConfig.direction !== 'vertical') return;
  if (ui.settingsOpen || ui.tocOpen) return;
  const dx = e.clientX - tapInfo.x;
  const dy = e.clientY - tapInfo.y;
  const dt = Math.max(1, Date.now() - tapInfo.t);
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (dt > 350) return;
  if (absX > 10 || absY > 10) return;
  if (e.target && e.target.closest && e.target.closest('button, input, a, select')) return;
  ui.toggleChrome();
}

// 阅读器隐藏 body 滚动前，记录页面滚动条宽度。部分 WebView 不支持
// scrollbar-gutter，若只隐藏滚动条，返回结束时书架会被突然挤窄。
function pageScrollsVertically() {
  const root = document.documentElement;
  return root.scrollHeight > root.clientHeight + 1 || window.scrollY > 0;
}

function measureScrollbarWidth() {
  // 用 fixed 探针直接量 fixed 元素实际可用的视口宽度；overlay 滚动条为 0
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'right:0',
    'width:1px',
    'height:1px',
    'visibility:hidden',
    'pointer-events:none'
  ].join(';');
  document.body.appendChild(probe);
  const width = window.innerWidth - probe.getBoundingClientRect().right;
  probe.remove();
  return Math.max(0, Math.round(width));
}

function setReaderScrollLock(locked) {
  const body = document.body;
  const bodyLocked = body.classList.contains('overflow-hidden');
  if (locked === bodyLocked) return;

  if (locked) {
    if (pageScrollsVertically()) {
      const scrollbarWidth = measureScrollbarWidth();
      if (scrollbarWidth > 0) {
        document.documentElement.style.setProperty(
          '--homura-reader-scrollbar-width',
          `${scrollbarWidth}px`
        );
        document.documentElement.classList.add('reader-scroll-reserved');
      }
    }
    body.classList.add('overflow-hidden');
    return;
  }

  body.classList.remove('overflow-hidden');
  document.documentElement.classList.remove('reader-scroll-reserved');
  document.documentElement.style.removeProperty('--homura-reader-scrollbar-width');
}

// 阅读器是全屏遮罩，锁住底层书架页的滚动，避免右侧多出无用的长滚动条
watch(() => reader.currentBook, book => {
  setReaderScrollLock(!!book);
  ui.resetReaderUi();
  if (book) ui.showChrome();
});

onBeforeUnmount(() => {
  setReaderScrollLock(false);
});

useShortcuts(reader, viewportRef, dismissWithPredictiveBack);
</script>
