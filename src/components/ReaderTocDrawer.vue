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
    <div v-if="ui.tocOpen" class="absolute inset-0 z-40 bg-black/25" @click="ui.closeToc()"></div>
  </Transition>

  <Transition
    enter-active-class="transition-transform duration-200 ease-out"
    enter-from-class="-translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-150 ease-in"
    leave-from-class="translate-x-0"
    leave-to-class="-translate-x-full"
  >
    <aside
      v-if="ui.tocOpen"
      class="absolute inset-y-0 left-0 z-50 w-[300px] max-w-[88%] h-full bg-[var(--bg-card)] border-r border-[var(--border-line)] shadow-2xl flex flex-col"
    >
      <div class="h-14 px-4 flex items-center justify-between border-b border-[var(--border-line)] shrink-0">
        <h3 class="text-sm font-display font-bold tracking-tight">目录</h3>
        <button @click="ui.closeToc()" class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--fg-muted)] hover:text-[var(--fg-main)] hover:bg-[var(--bg-subtle)] transition" title="关闭">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <!-- 漫画：页码网格 -->
        <div v-if="isManga" class="grid grid-cols-5 gap-1.5">
          <button
            v-for="(page, idx) in reader.activePages"
            :key="idx"
            @click="jumpTo(idx)"
            class="h-8 rounded-md border text-[11px] font-mono font-bold transition"
            :style="idx === reader.currentIndex
              ? 'background-color: var(--brand-primary); border-color: var(--brand-primary); color: #FFFFFF;'
              : 'background-color: var(--bg-subtle); border-color: var(--border-line); color: var(--fg-muted);'"
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
            class="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition truncate"
            :class="isCurrentChapter(group)
              ? 'bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)]'
              : 'text-[var(--fg-main)] border border-transparent hover:bg-[var(--bg-subtle)]'"
          >
            <span class="line-clamp-2 leading-snug">{{ group.title }}</span>
          </button>
          <p v-if="groups.length === 0" class="py-8 text-center text-xs text-[var(--fg-muted)]">暂无章节信息</p>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';

const reader = useReaderStore();
const ui = useUiStore();

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
