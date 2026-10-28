<template>
  <!-- Reader Bottom Control Bar -->
  <div class="h-11 border-t border-[var(--border-line)] bg-[var(--bg-card)]/95 backdrop-blur px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0 z-20">
    <button @click="reader.onLeftButtonClick()" :class="leftBtnClass">
      <span>←</span> <span>{{ leftText }}</span>
    </button>

    <div class="flex-1 max-w-xl flex items-center gap-3">
      <span class="text-xs font-mono font-bold text-[var(--fg-muted)] shrink-0 min-w-[65px] text-right">{{ reader.pageIndicator }}</span>
      <input
        type="range"
        min="0"
        :max="Math.max(0, reader.activePages.length - 1)"
        :value="reader.sliderValue"
        @input="reader.onSliderInput($event.target.value)"
        style="accent-color: var(--brand-primary);"
        class="w-full cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
        :class="{ 'rtl-slider': inverted }"
      />
      <button @click="reader.toggleRtlTapInvert()" class="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] shrink-0 hover:opacity-80 transition" title="点击可切换左右翻页按钮方向">
        {{ swapTapText }}
      </button>
    </div>

    <button @click="reader.onRightButtonClick()" :class="rightBtnClass">
      <span>{{ rightText }}</span> <span>→</span>
    </button>
  </div>
</template>

<script setup>
/* ============================================================================
   HOMURA · 阅读器底部控制条
   ----------------------------------------------------------------------------
   左右翻页按钮 / 进度滑条 / RTL 手势反转。按钮主副样式与文案随方向模式
   响应式切换（旧版 updateToolbarHighlight 的 className 改写改为 :class）。
   ========================================================================== */

import { computed } from 'vue';
import { useReaderStore } from '../stores/reader.js';

const reader = useReaderStore();
const config = reader.layoutConfig;

const inverted = computed(() => config.direction === 'rtl' && config.rtlInvertButtons);
const isVertical = computed(() => config.direction === 'vertical');
const spreadLabel = computed(() => (config.spread === 2 ? '双页并排' : '单页模式'));

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

const leftBtnClass = computed(() =>
  (inverted.value ? 'uiverse-btn-primary' : 'uiverse-btn') + ' py-1 px-3.5 shrink-0'
);
const rightBtnClass = computed(() =>
  (inverted.value ? 'uiverse-btn' : 'uiverse-btn-primary') + ' py-1 px-3.5 shrink-0'
);

const swapTapText = computed(() => {
  if (isVertical.value) return '上→下长卷';
  if (config.direction === 'rtl') {
    return inverted.value ? '日漫:左翻下一页(滚轮可用)' : '日漫:右翻下一页(滚轮可用)';
  }
  return `滚轮可翻页 · ${spreadLabel.value}`;
});
</script>
