<template>
  <!-- Reader Fullscreen Modal · 沉浸式：工具栏浮在画布上，默认自动隐藏 -->
  <div v-show="!!reader.currentBook" class="fixed inset-0 bg-[var(--bg-reader)] z-50 flex flex-col transition-colors duration-200">
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
        <ReaderTopBar v-if="ui.readerChromeVisible" class="absolute top-0 inset-x-0 z-30" />
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

import { ref, watch, computed } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';
import { useShortcuts } from '../composables/useShortcuts.js';
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
  tapInfo.x = e.clientX;
  tapInfo.y = e.clientY;
  tapInfo.t = Date.now();
}

function onTouchEnd(e) {
  if (e.pointerType === 'mouse' || reader.layoutConfig.direction !== 'vertical') return;
  if (Date.now() - tapInfo.t > 350) return;
  if (Math.abs(e.clientX - tapInfo.x) > 10 || Math.abs(e.clientY - tapInfo.y) > 10) return;
  if (e.target && e.target.closest && e.target.closest('button, input, a, select')) return;
  ui.toggleChrome();
}

// 阅读器是全屏遮罩，锁住底层书架页的滚动，避免右侧多出无用的长滚动条
watch(() => reader.currentBook, book => {
  document.body.classList.toggle('overflow-hidden', !!book);
  ui.resetReaderUi();
  if (book) ui.showChrome();
});

useShortcuts(reader, viewportRef);
</script>
