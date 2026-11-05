<template>
  <!-- 目录抽屉：M3 side sheet / bottom sheet，与设置和本目录共用外壳 -->
  <Transition
    enter-active-class="md-fade-enter-active"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="md-fade-leave-active"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="ui.tocOpen" class="absolute inset-0 z-40 md-scrim" @click="ui.closeToc()"></div>
  </Transition>

  <Transition
    enter-active-class="md-sheet-enter-active"
    :enter-from-class="isCompact ? 'translate-y-full' : 'translate-x-full'"
    :enter-to-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
    leave-active-class="md-sheet-leave-active"
    :leave-from-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
    :leave-to-class="isCompact ? 'translate-y-full' : 'translate-x-full'"
  >
    <aside
      v-if="ui.tocOpen"
      ref="tocSheetRef"
      id="reader-toc-drawer"
      class="md-drawer"
      aria-labelledby="reader-toc-title"
    >
      <ReaderDrawerHeader
        :is-compact="isCompact"
        title="目录"
        :subtitle="tocSubtitle"
        title-id="reader-toc-title"
        close-label="关闭目录"
        @close="ui.closeToc()"
        @drag-start="onSheetDragStart"
        @drag-move="onSheetDragMove"
        @drag-end="onSheetDragEnd"
        @drag-cancel="onSheetDragCancel"
      />

      <div class="md-drawer-body px-3 pb-4">
        <!-- 漫画：页码网格 -->
        <nav v-if="isManga" class="md-toc-grid" aria-label="漫画页码">
          <button
            v-for="(page, idx) in reader.activePages"
            :key="idx"
            type="button"
            @click="jumpTo(idx)"
            class="md-toc-page"
            :class="{ 'is-active': idx === reader.currentIndex }"
            :aria-label="`跳转到第 ${idx + 1} 页`"
            :aria-current="idx === reader.currentIndex ? 'page' : undefined"
          >
            {{ idx + 1 }}
          </button>
        </nav>

        <!-- 小说 / EPUB：章节列表 -->
        <nav v-else class="flex flex-col gap-1 pb-3" aria-label="章节目录">
          <button
            v-for="(group, index) in groups"
            :key="group.key"
            type="button"
            @click="jumpTo(group.index)"
            class="md-drawer-list-item"
            :class="{ 'is-active': isCurrentChapter(group) }"
            :title="group.title"
            :aria-current="isCurrentChapter(group) ? 'true' : undefined"
          >
            <span class="md-drawer-item-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="md-drawer-item-label line-clamp-2">{{ group.title }}</span>
            <span v-if="isCurrentChapter(group)" class="md-drawer-item-meta">正在阅读</span>
          </button>
          <p v-if="groups.length === 0" class="py-10 text-center text-[13px] text-[var(--md-on-surface-variant)]">暂无章节信息</p>
        </nav>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';
import { useSheetDrag } from '../composables/useSheetDrag.js';
import ReaderDrawerHeader from './ReaderDrawerHeader.vue';

const reader = useReaderStore();
const ui = useUiStore();
const { isCompact } = useViewport();
const tocOpen = computed(() => ui.tocOpen);
const {
  sheetRef: tocSheetRef,
  onDragStart: onSheetDragStart,
  onDragMove: onSheetDragMove,
  onDragEnd: onSheetDragEnd,
  onDragCancel: onSheetDragCancel
} = useSheetDrag({
  isCompact,
  isOpen: tocOpen,
  onClose: () => ui.closeToc()
});

const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

// 小说分页后同一章节可能跨多页，这里按 chapterIndex 聚合成目录条目
const groups = computed(() => {
  if (!reader.currentBook || isManga.value) return [];
  const map = new Map();
  reader.activePages.forEach((page, idx) => {
    const key = page.chapterIndex != null ? page.chapterIndex : 0;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: page.title || `第 ${key + 1} 章`,
        index: idx,
        end: idx
      });
    }
    map.get(key).end = idx;
  });
  return [...map.values()];
});

const tocSubtitle = computed(() => {
  const pages = reader.activePages.length;
  if (isManga.value) return `${pages} 页`;
  return `${groups.value.length} 章 · ${pages} 页`;
});

function isCurrentChapter(group) {
  return reader.currentIndex >= group.index && reader.currentIndex <= group.end;
}

function jumpTo(index) {
  reader.onSliderInput(index);
  ui.closeToc();
}
</script>
