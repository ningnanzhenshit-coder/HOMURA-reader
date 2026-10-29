<template>
  <!-- 阅读器顶部栏：只保留返回、书名、目录、设置 -->
  <header
    class="min-h-14 shrink-0 px-3 sm:px-5 flex items-center justify-between gap-2 bg-[var(--bg-card)] border-b border-[var(--border-line)]"
    :style="{ paddingTop: 'env(safe-area-inset-top)' }"
  >
    <div class="flex items-center gap-2.5 flex-1 min-w-0">
      <button @click="reader.closeReader()" class="uiverse-btn py-1 px-2.5 shrink-0" title="返回书架 (Esc)">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 19l-7-7 7-7"/></svg>
        <span class="hidden sm:inline">书架</span>
      </button>
      <div class="min-w-0">
        <h2 class="text-xs sm:text-sm font-bold truncate">{{ reader.currentBook ? reader.currentBook.title : '' }}</h2>
        <p class="text-[10px] font-mono text-[var(--brand-primary)] truncate hidden sm:block">{{ subStatus }}</p>
      </div>
    </div>

    <div class="flex items-center gap-1.5 shrink-0">
      <button @click="ui.openToc()" class="uiverse-btn py-1 px-2.5 text-[11px]" title="目录">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10"/></svg>
        <span class="hidden sm:inline">目录</span>
      </button>
      <button @click="ui.openSettings()" class="uiverse-btn py-1 px-2.5 text-[11px]" title="阅读设置">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 3.5h3l.4 2.1 1.8 1 2-.9 2.1 2.1-.9 2 .9 1.8 2.1.4v3l-2.1.4-.9 1.8.9 2-2.1 2.1-2-.9-1.8.9-.4 2.1h-3l-.4-2.1-1.8-.9-2 .9L4 16.2l.9-2-.9-1.8L2 12v-3l2.1-.4.9-1.8-.9-2L6.2 2.7l2 .9 1.8-1 .5-2.1z"/><circle cx="12" cy="12" r="3"/></svg>
        <span class="hidden sm:inline">设置</span>
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
