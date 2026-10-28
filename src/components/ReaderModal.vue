<template>
  <!-- Reader Fullscreen Modal -->
  <div v-show="!!reader.currentBook" class="fixed inset-0 bg-[var(--bg-reader)] z-50 flex flex-col transition-colors duration-200">
    <ReaderToolbar />

    <!-- Reader Main Viewport (Double-Buffered Track Viewport) -->
    <div ref="viewportRef" class="flex-1 overflow-hidden relative flex items-center justify-center p-0 select-text">
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
    </div>

    <ReaderBottomBar />
  </div>
</template>

<script setup>
/* ============================================================================
   HOMURA · 阅读器整屏遮罩
   ----------------------------------------------------------------------------
   v-show 保持 DOM 常驻以复用双缓冲槽位；打开时锁 body 滚动。
   视图按 书 id+类型 key 强制重挂载，保证每本书拿到干净的 buffer 状态。
   键盘 / 滚轮 / 窗口事件由 useShortcuts 统一管理。
   ========================================================================== */

import { ref, watch } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useShortcuts } from '../composables/useShortcuts.js';
import ReaderToolbar from './ReaderToolbar.vue';
import ReaderBottomBar from './ReaderBottomBar.vue';
import PaginatedView from './PaginatedView.vue';
import WebtoonView from './WebtoonView.vue';

const reader = useReaderStore();
const viewportRef = ref(null);

// 阅读器是全屏遮罩，锁住底层书架页的滚动，避免右侧多出无用的长滚动条
watch(() => reader.currentBook, book => {
  document.body.classList.toggle('overflow-hidden', !!book);
});

useShortcuts(reader, viewportRef);
</script>
