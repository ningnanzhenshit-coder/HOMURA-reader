<template>
  <div class="md-shelf-card group cursor-pointer flex flex-col min-w-0" @click="$emit('open', book.id)">
    <div class="aspect-[3/4] w-full relative overflow-hidden bg-[var(--md-surface-high)]">
      <img
        v-if="book.cover"
        :src="book.cover"
        class="manga-page-img w-full h-full object-cover group-hover:scale-105 transition duration-300"
        loading="lazy"
      />
      <div
        v-else
        class="w-full h-full p-3 flex flex-col justify-between text-[var(--md-on-primary)]"
        :style="{ background: 'linear-gradient(160deg, var(--md-primary), color-mix(in oklab, var(--md-primary) 52%, var(--md-tertiary)))' }"
      >
        <span class="text-[10px] min-[900px]:text-[12px] font-mono font-bold tracking-widest opacity-80">HOMURA</span>
        <div class="font-display font-bold text-[12px] min-[900px]:text-[13px] leading-snug line-clamp-3">{{ book.title }}</div>
        <span class="text-[10px] min-[900px]:text-[12px] opacity-80 font-mono">{{ subInfo }}</span>
      </div>

      <!-- 类型徽标 -->
      <span
        class="absolute top-2.5 left-2.5 px-2 py-[3px] rounded-full font-mono text-[10px] min-[900px]:text-[12px] font-semibold tracking-[0.04em] text-[var(--md-on-surface)]"
        :style="{ background: 'color-mix(in oklab, var(--md-surface) 84%, transparent)', backdropFilter: 'blur(8px)' }"
      >{{ badgeText }}</span>

      <button
        @click.stop="$emit('remove', book.id)"
        class="card-remove-btn md-hit-target absolute top-2 right-2 w-8 h-8 rounded-full text-[var(--md-surface)] flex items-center justify-center transition"
        style="background: color-mix(in oklab, var(--md-on-surface) 72%, transparent);"
        title="从书架移除"
        aria-label="从书架移除"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 6l12 12M18 6L6 18"/></svg>
      </button>

      <!-- 3px 进度条 -->
      <div v-if="progress" class="absolute bottom-0 inset-x-0 h-[3px]" style="background: rgba(0,0,0,0.18);">
        <div class="h-full" :style="{ width: progress.percent + '%', backgroundColor: 'var(--md-primary)' }"></div>
      </div>
    </div>

    <div class="px-2.5 pt-2 pb-2.5 min-[768px]:px-3 min-[768px]:pt-2.5 min-[768px]:pb-3 flex flex-col gap-1 min-w-0">
      <h4 class="font-bold text-[12px] min-[768px]:text-[13px] leading-snug truncate">{{ book.title }}</h4>
      <div class="flex items-baseline justify-between gap-1.5 min-w-0">
        <span class="font-mono text-[10px] min-[768px]:text-[12px] text-[var(--md-on-surface-variant)] truncate">{{ subInfo }}</span>
        <b class="font-mono text-[10px] min-[768px]:text-[12px] font-semibold text-[var(--md-primary)] shrink-0">
          {{ progress ? `${progress.percent}%` : '阅读 →' }}
        </b>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { resolveBookFormat } from '../services/utils.js';

const props = defineProps({
  book: { type: Object, required: true },
  progress: { type: Object, default: null }
});

defineEmits(['open', 'remove']);

const badgeText = computed(() => {
  const format = resolveBookFormat(props.book);
  if (format === 'pdf') return 'PDF';
  if (format === 'mobi') return 'MOBI';
  if (format === 'markdown') return 'MD';
  if (format === 'txt') return 'TXT';
  return props.book.type === 'manga' ? '漫画' : (props.book.type === 'epub' ? 'EPUB' : '小说');
});

const subInfo = computed(() =>
  props.book.type === 'manga'
    ? `${props.book.pageCount || (props.book.pageItems ? props.book.pageItems.length : 0)} 页`
    : `${props.book.pageCount || (props.book.chapters ? props.book.chapters.length : 1)} 章`
);
</script>
