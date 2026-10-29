<template>
  <!-- Reader Fullscreen Modal · 沉浸式：工具栏浮在画布上，默认自动隐藏 -->
  <div v-show="!!reader.currentBook" class="fixed inset-0 bg-[var(--bg-reader)] z-50 flex flex-col transition-colors duration-200">
    <div ref="viewportRef" class="relative flex-1 min-h-0 overflow-hidden select-text" @mousemove="onMouseMove" @click="ui.showChrome()">
      <template v-if="reader.currentBook">
        <WebtoonView
          v-if="reader.layoutConfig.direction === 'vertical'"
          :key="'webtoon-' + reader.currentBook.id"
        />
        <PaginatedView
          v-else
          :key="'paginated-' + reader.currentBook.type + '-' + reader.currentBook.id"
        />
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
   鼠标靠近上/下边缘、点击画布或按 Esc 唤出，1 秒无操作淡出。
   设置与目录改为左右抽屉，不再占用顶栏。
   ========================================================================== */

import { ref, watch } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';
import { useShortcuts } from '../composables/useShortcuts.js';
import ReaderTopBar from './ReaderTopBar.vue';
import ReaderBottomBar from './ReaderBottomBar.vue';
import ReaderTocDrawer from './ReaderTocDrawer.vue';
import ReaderSettingsDrawer from './ReaderSettingsDrawer.vue';
import PaginatedView from './PaginatedView.vue';
import WebtoonView from './WebtoonView.vue';

const reader = useReaderStore();
const ui = useUiStore();
const viewportRef = ref(null);

// 鼠标贴近上下边缘唤出工具栏；工具栏可见时，移动鼠标会重新计时
function onMouseMove(e) {
  if (!reader.currentBook) return;
  const nearEdge = e.clientY <= 72 || e.clientY >= window.innerHeight - 72;
  if (nearEdge || ui.readerChromeVisible) ui.showChrome();
}

// 阅读器是全屏遮罩，锁住底层书架页的滚动，避免右侧多出无用的长滚动条
watch(() => reader.currentBook, book => {
  document.body.classList.toggle('overflow-hidden', !!book);
  ui.resetReaderUi();
  if (book) ui.showChrome();
});

useShortcuts(reader, viewportRef);
</script>
