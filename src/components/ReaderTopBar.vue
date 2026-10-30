<template>
  <!-- 阅读器顶部栏：MD3 Top App Bar（返回 / 书名+副标题 / 目录 / 设置） -->
  <header
    class="shrink-0 min-h-14 min-[900px]:min-h-16 flex items-center gap-2.5 px-1.5 min-[900px]:px-[18px] bg-[var(--md-surface)] border-b border-[var(--md-outline-variant)]"
    :style="{ paddingTop: 'env(safe-area-inset-top)' }"
  >
    <button
      @click="reader.closeReader()"
      class="w-10 h-10 shrink-0 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
      title="返回书架 (Esc)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>

    <div class="min-w-0 flex-1">
      <h2 class="text-[12.5px] min-[900px]:text-sm font-semibold truncate leading-tight">{{ reader.currentBook ? reader.currentBook.title : '' }}</h2>
      <p class="font-mono text-[8.5px] text-[var(--md-primary)] truncate">{{ subStatus }}</p>
    </div>

    <div class="flex items-center gap-0.5 shrink-0">
      <button
        @click="ui.openToc()"
        class="w-10 h-10 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
        title="目录"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10"/>
        </svg>
      </button>
      <button
        @click="ui.openSettings()"
        class="w-10 h-10 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
        title="阅读设置"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" stroke-width="2"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';

const reader = useReaderStore();
const ui = useUiStore();

const subStatus = computed(() => {
  const total = reader.activePages.length;
  const pos = `${reader.currentIndex + 1} / ${total}`;
  if (reader.layoutConfig.direction === 'vertical') return `纵向长卷 · ${pos}`;
  if (reader.layoutConfig.direction === 'rtl') return `日漫右→左 · ${pos}`;
  return `左→右 · ${reader.effectiveDouble ? '双页' : '单页'} · ${pos}`;
});
</script>
