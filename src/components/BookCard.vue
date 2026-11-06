<template>
  <article class="md-card md-card--filled md-shelf-card relative flex flex-col min-w-0" :class="{ 'md-book-selected': selected, 'is-touch-dragging': dragging }" :draggable="!importing" :aria-busy="importing || undefined" @dragstart="$emit('drag', $event, book.id)" @contextmenu.prevent>
    <button v-if="!importing" class="absolute inset-0 z-10 rounded-[12px]" :aria-label="selecting ? `选择书本：${book.title}` : `阅读：${book.title}`" :aria-pressed="selecting ? selected : undefined" @click="$emit('open', book.id)"></button>
    <div class="aspect-[var(--shelf-cover-ratio)] w-full relative overflow-hidden bg-[var(--md-surface-high)]">
      <img
        v-if="book.cover"
        :src="book.cover"
        class="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        fetchpriority="low"
        draggable="false"
      />
      <div
        v-else
        class="w-full h-full p-3 flex flex-col justify-between text-[var(--md-on-primary)]"
        :style="{ background: 'linear-gradient(160deg, var(--md-primary), color-mix(in oklab, var(--md-primary) 52%, var(--md-tertiary)))' }"
      >
        <span class="text-[10px] min-[900px]:text-[11px] font-mono font-bold tracking-widest opacity-80">HOMURA</span>
        <div class="font-display font-bold text-[12px] min-[900px]:text-[13px] leading-snug line-clamp-3">{{ book.title }}</div>
        <span class="text-[10px] min-[900px]:text-[11px] opacity-80 font-mono">{{ subInfo }}</span>
      </div>

      <!-- 类型徽标 -->
      <span
        class="absolute top-2.5 left-2.5 px-2 py-[3px] rounded-full font-mono text-[10px] min-[900px]:text-[11px] font-semibold tracking-[0.04em] text-[var(--md-on-surface)]"
        :style="{ background: 'color-mix(in oklab, var(--md-surface) 92%, transparent)' }"
      >{{ badgeText }}</span>

      <button
        v-if="!selecting && !importing"
        @click.stop="$emit('remove', book.id)"
        class="book-remove-button md-hit-target absolute z-20 top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
        :title="removeLabel"
        :aria-label="removeLabel"
      >
        <MdIcon name="close" class="w-3.5 h-3.5" />
      </button>
      <span v-else-if="selecting && !importing" class="md-select-badge" aria-hidden="true">
        <MdIcon :name="selected ? 'check' : 'radio_button_unchecked'" :size="16" />
      </span>

      <!-- 3px 进度条 -->
      <div v-if="progress" class="book-progress-track absolute bottom-0 inset-x-0 h-[3px]" aria-hidden="true">
        <div class="book-progress-fill h-full" :style="{ width: progress.percent + '%' }"></div>
      </div>
      <ImportShade :ratio="importRatio" />
    </div>

    <div class="px-2 py-1.5 min-[768px]:px-3 flex flex-col gap-0.5 min-w-0">
      <h4 class="font-semibold text-[12px] min-[768px]:text-[13px] leading-snug truncate">{{ book.title }}</h4>
      <div class="flex items-baseline justify-between gap-1.5 min-w-0">
        <span class="font-mono text-[10px] min-[768px]:text-[11px] text-[var(--md-on-surface-variant)] truncate">{{ subInfo }}</span>
        <b class="font-mono text-[10px] min-[768px]:text-[11px] font-semibold text-[var(--md-primary)] shrink-0">
          {{ importing ? '导入中' : progress ? `${progress.percent}%` : '阅读 →' }}
        </b>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { resolveBookFormat } from '../services/utils.js';
import MdIcon from './MdIcon.vue';
import ImportShade from './ImportShade.vue';

const props = defineProps({
  book: { type: Object, required: true },
  selecting: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  removeLabel: { type: String, default: '从书架移除' },
  progress: { type: Object, default: null },
  dragging: { type: Boolean, default: false },
  importRatio: { type: Number, default: null }
});

defineEmits(['open', 'remove', 'drag']);

const importing = computed(() => props.importRatio !== null);
const badgeText = computed(() => {
  const format = resolveBookFormat(props.book);
  if (format === 'pdf') return 'PDF';
  if (format === 'mobi') return 'MOBI';
  if (format === 'markdown') return 'MD';
  if (format === 'txt') return 'TXT';
  return props.book.type === 'manga' ? '漫画' : (props.book.type === 'epub' ? 'EPUB' : '小说');
});

const subInfo = computed(() =>
  importing.value && !props.book.pageCount ? '' : props.book.type === 'manga'
    ? `${props.book.pageCount || (props.book.pageItems ? props.book.pageItems.length : 0)} 页`
    : `${props.book.pageCount || (props.book.chapters ? props.book.chapters.length : 1)} 章`
);
</script>

<style scoped>
.book-remove-button {
  background: var(--md-surface-container);
  color: var(--md-on-surface);
  box-shadow: 0 1px 3px color-mix(in oklab, var(--md-shadow-color) 24%, transparent);
}

@media (hover: hover) and (pointer: fine) {
  .book-remove-button {
    opacity: 0;
    pointer-events: none;
  }
  .md-shelf-card:hover .book-remove-button,
  .book-remove-button:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }
  .book-remove-button:hover {
    background: var(--md-surface-highest);
  }
}

@media (hover: none) {
  .book-remove-button { display: none; }
}

.book-progress-track {
  background: color-mix(in oklab, var(--md-on-surface) 18%, transparent);
}

.book-progress-fill {
  background: var(--md-primary);
}

@media (prefers-reduced-motion: reduce) {
  .book-remove-button {
    transition: none;
  }
}
</style>
