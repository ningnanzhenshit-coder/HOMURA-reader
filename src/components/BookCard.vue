<template>
  <div class="editorial-card group cursor-pointer overflow-hidden flex flex-col" @click="$emit('open', book.id)">
    <div class="aspect-[3/4] w-full bg-[var(--bg-subtle)] relative overflow-hidden border-b border-[var(--border-line)]">
      <img
        v-if="book.cover"
        :src="book.cover"
        class="manga-page-img w-full h-full object-cover group-hover:scale-105 transition duration-300"
        loading="lazy"
      />
      <div
        v-else
        style="background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover));"
        class="w-full h-full p-4 flex flex-col justify-between text-white"
      >
        <span class="text-[10px] font-mono font-bold tracking-widest opacity-80">ACGN·GO</span>
        <div class="font-display font-bold text-sm line-clamp-3 leading-snug text-white">{{ book.title }}</div>
        <span class="text-[10px] opacity-80 font-mono">{{ subInfo }}</span>
      </div>
      <span style="background-color: var(--brand-primary);" class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold text-white shadow">
        {{ badgeText }}
      </span>
      <button
        @click.stop="$emit('remove', book.id)"
        class="absolute top-2.5 right-2.5 w-6 h-6 rounded-md bg-slate-900/75 hover:bg-red-600 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        title="从书架移除"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div v-if="progress" class="absolute bottom-0 inset-x-0 h-[3px] bg-slate-900/25">
        <div class="h-full" :style="{ width: progress.percent + '%', backgroundColor: 'var(--brand-primary)' }"></div>
      </div>
    </div>
    <div class="p-3 flex-1 flex flex-col justify-between gap-1.5">
      <h4 class="font-bold text-xs line-clamp-2 leading-snug group-hover:text-[var(--brand-primary)] transition">
        {{ book.title }}
      </h4>
      <div class="flex items-center justify-between text-[11px] font-mono text-[var(--fg-muted)] pt-1">
        <span>{{ subInfo }}</span>
        <span class="text-[var(--brand-primary)] font-bold">{{ progress ? `读至 ${progress.percent}%` : '阅读 →' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  book: { type: Object, required: true },
  progress: { type: Object, default: null }
});

defineEmits(['open', 'remove']);

const badgeText = computed(() =>
  props.book.type === 'manga' ? '漫画' : (props.book.type === 'epub' ? 'EPUB' : '小说')
);

const subInfo = computed(() =>
  props.book.type === 'manga'
    ? `共 ${props.book.pageCount || (props.book.pageItems ? props.book.pageItems.length : 0)} 页`
    : `共 ${props.book.pageCount || (props.book.chapters ? props.book.chapters.length : 1)} 章`
);
</script>
