<template>
  <article
    class="flex-1 h-full max-w-[660px] bg-[var(--md-surface-low)] text-[var(--md-on-surface)] rounded-[16px] shadow-sm border border-[var(--md-outline-variant)] px-6 py-5 sm:px-10 sm:py-7 flex flex-col justify-between overflow-hidden"
    :style="{ fontSize: fontSize + 'px' }"
  >
    <div class="flex-1 overflow-hidden flex flex-col">
      <div class="flex items-center justify-between border-b border-[var(--border-line)] pb-2.5 mb-4 text-xs font-sans text-[var(--brand-primary)] font-bold shrink-0">
        <span class="truncate">{{ page ? page.title : '章节' }}</span>
        <span class="font-mono shrink-0 ml-2">{{ page ? `${sideLabel} ${page.pageNumber} / ${total}` : '' }}</span>
      </div>
      <div class="epub-content font-serif leading-relaxed flex-1 overflow-hidden" v-html="page ? page.html : ''"></div>
    </div>
    <div class="pt-3 text-center text-[11px] font-mono text-[var(--fg-muted)] shrink-0">
      {{ page ? `— 第 ${page.pageNumber} 页 —` : '' }}
    </div>
  </article>
</template>

<script setup>
defineProps({
  page: { type: Object, default: null },
  sideLabel: { type: String, default: '' },
  total: { type: Number, default: 1 },
  fontSize: { type: Number, default: 18 }
});
</script>
