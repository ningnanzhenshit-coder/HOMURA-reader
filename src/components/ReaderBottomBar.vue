<template>
  <!-- 阅读器底部栏：只保留翻页与进度 -->
  <footer
    class="min-h-12 shrink-0 px-3 sm:px-6 flex items-center gap-3 bg-[var(--bg-card)] border-t border-[var(--border-line)]"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
  >
    <button @click="reader.onLeftButtonClick()" :class="leftBtnClass" :title="leftText">
      <span class="text-sm">←</span>
      <span class="hidden sm:inline">{{ leftText }}</span>
    </button>

    <div class="flex-1 flex items-center gap-3 min-w-0">
      <span class="text-[11px] font-mono font-bold text-[var(--fg-muted)] shrink-0 min-w-[54px] text-right tabular-nums">{{ reader.pageIndicator }}</span>
      <input
        type="range"
        min="0"
        :max="Math.max(0, reader.activePages.length - 1)"
        :value="reader.sliderValue"
        @input="reader.onSliderInput($event.target.value)"
        style="accent-color: var(--brand-primary);"
        class="flex-1 min-w-0 cursor-pointer h-1.5 bg-[var(--bg-subtle)] rounded-lg"
        :class="{ 'rtl-slider': inverted }"
        title="拖动跳转"
      />
      <span class="text-[10px] font-mono text-[var(--fg-muted)] shrink-0 tabular-nums hidden sm:inline">{{ percentText }}</span>
    </div>

    <button @click="reader.onRightButtonClick()" :class="rightBtnClass" :title="rightText">
      <span class="hidden sm:inline">{{ rightText }}</span>
      <span class="text-sm">→</span>
    </button>
  </footer>
</template>

<script setup>
import { computed } from 'vue';
import { useReaderStore } from '../stores/reader.js';

const reader = useReaderStore();
const config = reader.layoutConfig;

const inverted = computed(() => config.direction === 'rtl' && config.rtlInvertButtons);
const isVertical = computed(() => config.direction === 'vertical');

const leftText = computed(() => {
  if (isVertical.value) return '上滚一屏';
  if (config.direction === 'rtl') return inverted.value ? '下一页' : '上一页';
  return '上一页';
});

const rightText = computed(() => {
  if (isVertical.value) return '下滚一屏';
  if (config.direction === 'rtl') return inverted.value ? '上一页' : '下一页';
  return '下一页';
});

const percentText = computed(() => {
  const total = reader.activePages.length;
  if (!total) return '0%';
  return Math.round(((reader.currentIndex + 1) / total) * 100) + '%';
});

const leftBtnClass = computed(() =>
  (inverted.value ? 'uiverse-btn-primary' : 'uiverse-btn') + ' min-h-9 sm:min-h-0 py-1 px-2.5 shrink-0'
);
const rightBtnClass = computed(() =>
  (inverted.value ? 'uiverse-btn' : 'uiverse-btn-primary') + ' min-h-9 sm:min-h-0 py-1 px-2.5 shrink-0'
);
</script>
