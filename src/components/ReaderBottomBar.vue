<template>
  <!-- 阅读器底部栏：M3 floating bottom app bar + 进度滑条 -->
  <footer class="md-reader-bottombar" aria-label="阅读进度与翻页">
    <button
      type="button"
      @click="reader.onLeftButtonClick()"
      class="md-icon-button"
      :class="{ 'is-filled': inverted }"
      :title="leftText"
      :aria-label="leftText"
      :disabled="reader.openingBook"
    >
      <MdIcon name="chevron_left" />
    </button>

    <div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
      <div class="flex items-baseline justify-between gap-3 px-1 font-mono text-[10.5px] leading-4 text-[var(--md-on-surface-variant)] tabular-nums">
        <span class="truncate">{{ reader.pageIndicator }}</span>
        <span class="shrink-0 font-medium text-[var(--md-on-surface)]">{{ percentText }}</span>
      </div>
      <MdRange
        :model-value="reader.sliderValue"
        :min="0"
        :max="Math.max(0, reader.activePages.length - 1)"
        :rtl="inverted"
        title="拖动跳转"
        aria-label="阅读进度"
        :aria-valuetext="`${reader.pageIndicator}，${percentText}`"
        :disabled="reader.openingBook"
        class="w-full min-w-0"
        @update:model-value="reader.onSliderInput"
      />
    </div>

    <!-- 桌面快捷：单页 / 双页 -->
    <div v-if="!isVertical" class="hidden min-[900px]:block shrink-0 ml-1.5">
      <MdSegmentedControl
        :model-value="config.spread"
        :options="spreadOptions"
        aria-label="翻页布局"
        style="--md-segmented-bg: var(--md-surface-high)"
        @update:model-value="value => reader.setSpreadCount(Number(value))"
      />
    </div>

    <button
      type="button"
      @click="reader.onRightButtonClick()"
      class="md-icon-button"
      :class="{ 'is-filled': !inverted }"
      :title="rightText"
      :aria-label="rightText"
      :disabled="reader.openingBook"
    >
      <MdIcon name="chevron_right" />
    </button>
  </footer>
</template>

<script setup>
import { computed } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import MdIcon from './MdIcon.vue';
import MdRange from './MdRange.vue';
import MdSegmentedControl from './MdSegmentedControl.vue';

const reader = useReaderStore();
const config = reader.layoutConfig;

const inverted = computed(() => config.direction === 'rtl' && config.rtlInvertButtons);
const isVertical = computed(() => config.direction === 'vertical');

const spreadOptions = [
  { value: 1, label: '单页', title: '单页阅读' },
  { value: 2, label: '双页', title: '双页阅读' }
];

const leftText = computed(() => {
  if (inverted.value && reader.atLastPage && reader.nextCollectionBook) return '下一本';
  if (!inverted.value && reader.atFirstPage && reader.previousCollectionBook) return '上一本';
  if (isVertical.value) return '上滚一屏';
  if (config.direction === 'rtl') return inverted.value ? '下一页' : '上一页';
  return '上一页';
});

const rightText = computed(() => {
  if (!inverted.value && reader.atLastPage && reader.nextCollectionBook) return '下一本';
  if (inverted.value && reader.atFirstPage && reader.previousCollectionBook) return '上一本';
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
