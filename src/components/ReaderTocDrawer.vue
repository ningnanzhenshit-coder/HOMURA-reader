<template>
  <!-- 目录抽屉 -->
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="ui.tocOpen" class="absolute inset-0 z-40 md-scrim" @click="ui.closeToc()"></div>
  </Transition>

  <Transition
    enter-active-class="md-sheet-enter-active"
    :enter-from-class="isCompact ? 'translate-y-full' : '-translate-x-full'"
    :enter-to-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
    leave-active-class="md-sheet-leave-active"
    :leave-from-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
    :leave-to-class="isCompact ? 'translate-y-full' : '-translate-x-full'"
  >
    <aside
      v-if="ui.tocOpen"
      class="absolute z-50 bg-[var(--md-surface-container)] shadow-2xl flex flex-col"
      :class="isCompact
        ? 'inset-x-0 bottom-0 w-full max-h-[78dvh] rounded-t-[28px]'
        : 'inset-y-0 left-0 w-[320px] max-w-[88%] h-full rounded-r-[28px]'"
      :style="isCompact ? { paddingBottom: 'env(safe-area-inset-bottom)' } : null"
    >
      <div v-if="isCompact" class="pt-2.5 pb-1 flex justify-center shrink-0">
        <span class="w-8 h-1 rounded-full bg-[var(--md-outline-variant)]"></span>
      </div>
      <div class="h-14 px-4 flex items-center justify-between shrink-0">
        <h3 class="text-[15px] font-semibold">目录</h3>
        <button @click="ui.closeToc()" class="w-8 h-8 rounded-full flex items-center justify-center text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-high)] transition" title="关闭">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-2">
        <!-- 漫画：页码网格 -->
        <div v-if="isManga" class="grid grid-cols-5 gap-1.5">
          <button
            v-for="(page, idx) in reader.activePages"
            :key="idx"
            @click="jumpTo(idx)"
            class="h-8 rounded-lg border text-[11px] font-mono font-bold transition"
            :style="idx === reader.currentIndex
              ? 'background-color: var(--md-primary); border-color: var(--md-primary); color: var(--md-on-primary);'
              : 'background-color: var(--md-surface-high); border-color: transparent; color: var(--md-on-surface-variant);'"
          >
            {{ idx + 1 }}
          </button>
        </div>

        <!-- 小说 / EPUB：章节列表 -->
        <div v-else class="flex flex-col gap-0.5">
          <button
            v-for="group in groups"
            :key="group.key"
            @click="jumpTo(group.index)"
            class="w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition truncate"
            :class="isCurrentChapter(group)
              ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]'
              : 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-high)]'"
          >
            <span class="line-clamp-2 leading-snug">{{ group.title }}</span>
          </button>
          <p v-if="groups.length === 0" class="py-8 text-center text-xs text-[var(--md-on-surface-variant)]">暂无章节信息</p>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';

const reader = useReaderStore();
const ui = useUiStore();
const { isCompact } = useViewport();

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

function isCurrentChapter(group) {
  return reader.currentIndex >= group.index && reader.currentIndex <= group.end;
}

function jumpTo(index) {
  reader.onSliderInput(index);
  ui.closeToc();
}
</script>
