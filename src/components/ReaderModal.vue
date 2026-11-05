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
      @pointermove="onViewportPointerMove"
      @pointerdown="onTouchStart"
      @pointerup="onTouchEnd"
      @pointercancel="cancelVerticalGesture"
      @lostpointercapture="cancelVerticalGesture"
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
        enter-active-class="md-reader-bar-enter-active"
        enter-from-class="-translate-y-2 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="md-reader-bar-leave-active"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-2 opacity-0"
      >
        <ReaderTopBar
          v-if="ui.readerChromeVisible"
          @back="dismissWithPredictiveBack"
        />
      </Transition>

      <Transition
        enter-active-class="md-reader-bar-enter-active"
        enter-from-class="translate-y-2 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="md-reader-bar-leave-active"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-2 opacity-0"
      >
        <ReaderBottomBar v-if="ui.readerChromeVisible" />
      </Transition>

      <ReaderTocDrawer />
      <ReaderSettingsDrawer />
      <ReaderCollectionDrawer />
      <Transition
        enter-active-class="md-fade-enter-active"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="md-fade-leave-active"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="reader.openingBook || reader.openError"
          class="md-reader-status"
          :role="reader.openError ? 'alert' : 'status'"
          :aria-live="reader.openError ? 'assertive' : 'polite'"
        >
          <span v-if="!reader.openError" class="md-reader-spinner" aria-hidden="true"></span>
          <span class="md-reader-status-copy">{{ reader.openError || '正在打开书本…' }}</span>
          <button v-if="reader.openError" type="button" class="md-text-button" @click="reader.clearOpenError()">关闭</button>
        </div>
      </Transition>
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

import { shallowRef, watch, computed, onBeforeUnmount } from 'vue';
import { classifyReaderGesture } from '../services/readerGestures.js';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';
import { useShortcuts } from '../composables/useShortcuts.js';
import { useReaderBackDismiss } from '../composables/useReaderBackDismiss.js';
import ReaderTopBar from './ReaderTopBar.vue';
import ReaderBottomBar from './ReaderBottomBar.vue';
import ReaderTocDrawer from './ReaderTocDrawer.vue';
import ReaderSettingsDrawer from './ReaderSettingsDrawer.vue';
import ReaderCollectionDrawer from './ReaderCollectionDrawer.vue';
import PaginatedView from './PaginatedView.vue';
import WebtoonView from './WebtoonView.vue';

const reader = useReaderStore();
const ui = useUiStore();
const { isCompact } = useViewport();
const viewportRef = shallowRef(null);
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
  if (e.pointerType !== 'mouse' || e.buttons) return;
  if (!reader.currentBook) return;
  const nearEdge = e.clientY <= 88 || e.clientY >= window.innerHeight - 88;
  if (nearEdge || ui.readerChromeVisible) ui.showChrome();
}

// 条漫保留原生纵向滚动，鼠标按住正文也可上下拖动，短点沿用四分区。
const tapInfo = { active: false, pointerId: null, x: 0, y: 0, t: 0, maxDistance: 0, scrollTop: 0 };

function onTouchStart(e) {
  if (reader.layoutConfig.direction !== 'vertical' || e.isPrimary === false) return;
  if (ui.readerDrawerOpen) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest?.('button, input, a, select, textarea, [role="dialog"]')) return;
  tapInfo.active = true;
  tapInfo.pointerId = e.pointerId;
  tapInfo.x = e.clientX;
  tapInfo.y = e.clientY;
  tapInfo.t = Date.now();
  tapInfo.maxDistance = 0;
  tapInfo.scrollTop = viewportRef.value.querySelector('[data-reader-scroll]')?.scrollTop || 0;
}

function onViewportPointerMove(e) {
  onMouseMove(e);
  if (!tapInfo.active || tapInfo.pointerId !== e.pointerId) return;
  const dx = e.clientX - tapInfo.x;
  const dy = e.clientY - tapInfo.y;
  tapInfo.maxDistance = Math.max(tapInfo.maxDistance, Math.abs(dx), Math.abs(dy));
  if (e.pointerType === 'mouse' && Math.abs(dy) >= 8 && Math.abs(dy) > Math.abs(dx)) {
    const root = viewportRef.value.querySelector('[data-reader-scroll]');
    if (root) root.scrollTop = tapInfo.scrollTop - dy;
    e.preventDefault();
    try { viewportRef.value.setPointerCapture(e.pointerId); } catch (err) {}
  }
}

function onTouchEnd(e) {
  if (!tapInfo.active || tapInfo.pointerId !== e.pointerId) return;
  tapInfo.active = false;
  const bounds = viewportRef.value.getBoundingClientRect();
  const result = classifyReaderGesture({ dx: e.clientX - tapInfo.x, dy: e.clientY - tapInfo.y, duration: Date.now() - tapInfo.t, maxDistance: tapInfo.maxDistance, width: bounds.width, x: e.clientX - bounds.left });
  if (ui.readerDrawerOpen || result.type === 'cancel') return;
  if (result.zone === 'left') reader.onLeftButtonClick();
  else if (result.zone === 'right') reader.onRightButtonClick();
  else ui.toggleChrome();
}

function cancelVerticalGesture() { tapInfo.active = false; }

watch(() => reader.currentCollection?.id, id => { if (!id && ui.collectionTocOpen) ui.closeCollectionToc(); });

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
  const html = document.documentElement;
  const isLocked = html.classList.contains('reader-scroll-locked');
  if (locked === isLocked) return;

  if (locked) {
    if (pageScrollsVertically()) {
      const scrollbarWidth = measureScrollbarWidth();
      if (scrollbarWidth > 0) {
        html.style.setProperty(
          '--homura-reader-scrollbar-width',
          `${scrollbarWidth}px`
        );
        html.classList.add('reader-scroll-reserved');
      }
    }
    html.classList.add('reader-scroll-locked');
    return;
  }

  html.classList.remove('reader-scroll-locked');
  html.classList.remove('reader-scroll-reserved');
  html.style.removeProperty('--homura-reader-scrollbar-width');
}

// 阅读器是全屏遮罩，锁住底层书架页的滚动，避免右侧多出无用的长滚动条
watch(() => reader.currentBook?.id, id => {
  cancelVerticalGesture();
  setReaderScrollLock(!!id);
  document.documentElement.classList.toggle('reader-active', !!id);
  ui.resetReaderUi();
  if (id) ui.showChrome();
});

onBeforeUnmount(() => {
  setReaderScrollLock(false);
  document.documentElement.classList.remove('reader-active');
});

useShortcuts(reader, viewportRef, dismissWithPredictiveBack);
</script>
