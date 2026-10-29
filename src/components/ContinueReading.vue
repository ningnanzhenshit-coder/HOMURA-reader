<template>
  <!-- 继续阅读：最近读过但未完成的作品 -->
  <section v-if="items.length" class="space-y-3">
    <div class="flex items-center gap-2.5">
      <div class="w-2 h-5 rounded-full bg-[var(--brand-primary)]"></div>
      <h3 class="text-sm font-display font-bold tracking-tight">继续阅读</h3>
      <span class="text-[11px] font-mono text-[var(--fg-muted)]">{{ items.length }} 部未读完</span>
    </div>

    <div class="flex gap-3 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
      <button
        v-for="item in items"
        :key="item.book.id"
        @click="$emit('open', item.book.id)"
        class="group shrink-0 w-[78vw] max-w-[240px] sm:w-[240px] flex items-stretch gap-3 p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-line)] hover:border-[var(--brand-primary)] transition text-left"
      >
        <div class="w-12 h-16 rounded-md overflow-hidden bg-[var(--bg-subtle)] shrink-0">
          <img v-if="item.book.cover" :src="item.book.cover" class="w-full h-full object-cover" loading="lazy" />
          <div v-else style="background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover));" class="w-full h-full"></div>
        </div>
        <div class="min-w-0 flex-1 flex flex-col justify-between py-0.5">
          <div class="min-w-0">
            <p class="text-xs font-bold line-clamp-2 leading-snug group-hover:text-[var(--brand-primary)] transition">{{ item.book.title }}</p>
            <p class="text-[10px] font-mono text-[var(--fg-muted)] mt-1 truncate">{{ pageText(item) }} · {{ item.progress.percent }}%</p>
          </div>
          <div class="h-1 rounded-full bg-[var(--bg-subtle)] overflow-hidden mt-1.5">
            <div class="h-full bg-[var(--brand-primary)]" :style="{ width: item.progress.percent + '%' }"></div>
          </div>
        </div>
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useShelfStore } from '../stores/shelf.js';

defineEmits(['open']);

const shelf = useShelfStore();

const items = computed(() =>
  shelf.library
    .map(book => ({ book, progress: shelf.progressInfoFor(book.id) }))
    .filter(item => item.progress)
    .sort((a, b) => (b.progress.updatedAt || 0) - (a.progress.updatedAt || 0))
    .slice(0, 6)
);

function pageText(item) {
  const idx = (item.progress.index || 0) + 1;
  return item.book.type === 'manga' ? `第 ${idx} 页` : `第 ${idx} 章`;
}
</script>
