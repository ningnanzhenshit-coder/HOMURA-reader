<template>
  <!-- 阅读器底部栏：页码 + MD3 胶囊进度滑条 + 上一页/下一页 -->
  <footer
    class="shrink-0 min-h-[72px] min-[900px]:min-h-20 px-3 min-[900px]:px-[22px] flex items-center gap-2 min-[900px]:gap-3.5 bg-[var(--md-surface)] border-t border-[var(--md-outline-variant)]"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
  >
    <button
      @click="reader.onLeftButtonClick()"
      class="w-11 h-11 shrink-0 rounded-full grid place-items-center transition-colors duration-200"
      :class="inverted
        ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
        : 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)]'"
      :title="leftText"
      :aria-label="leftText"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>

    <span class="font-mono text-[9.5px] min-[900px]:text-[10px] text-[var(--md-on-surface-variant)] tabular-nums shrink-0 whitespace-nowrap">{{ reader.pageIndicator }}</span>

    <input
      type="range"
      min="0"
      :max="Math.max(0, reader.activePages.length - 1)"
      :value="reader.sliderValue"
      @input="reader.onSliderInput($event.target.value)"
      class="md-range flex-1 min-w-0"
      :class="{ 'rtl-slider': inverted }"
      title="拖动跳转"
      aria-label="拖动跳转"
    />

    <span class="font-mono text-[10px] min-[900px]:text-[10px] text-[var(--md-on-surface-variant)] tabular-nums shrink-0">{{ percentText }}</span>

    <!-- 桌面快捷：单页 / 双页 -->
    <div v-if="!isVertical" class="hidden min-[900px]:flex items-center p-[3px] rounded-[20px] bg-[var(--md-surface-container)] ml-1.5">
      <button
        @click="reader.setSpreadCount(1)"
        class="px-3 py-[7px] rounded-[17px] text-[10.5px] font-semibold transition-colors duration-200"
        :class="config.spread === 1 ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]' : 'text-[var(--md-on-surface-variant)]'"
        title="单页阅读"
      >单页</button>
      <button
        @click="reader.setSpreadCount(2)"
        class="px-3 py-[7px] rounded-[17px] text-[10.5px] font-semibold transition-colors duration-200"
        :class="config.spread === 2 ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]' : 'text-[var(--md-on-surface-variant)]'"
        title="双页阅读"
      >双页</button>
    </div>

    <button
      @click="reader.onRightButtonClick()"
      class="w-11 h-11 shrink-0 rounded-full grid place-items-center transition-colors duration-200"
      :class="inverted
        ? 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)]'
        : 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'"
      :title="rightText"
      :aria-label="rightText"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 5l7 7-7 7"/>
      </svg>
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
</script>
