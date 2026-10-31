<template>
  <!-- 外观设置面板内容：主题色 + 阅读模式（桌面浮层 / 手机底部 sheet 共用） -->
  <div>
    <div class="py-3 border-t-[0.5px] border-[var(--md-outline-variant)]">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-[12px] font-semibold">阅读模式</span>
        <b class="font-mono text-[12px] font-medium text-[var(--md-on-surface-variant)]">{{ modeLabel }}</b>
      </div>
      <MdSegmentedControl
        class="w-full"
        :model-value="theme.surfaceMode"
        :options="modes"
        aria-label="阅读模式"
        @update:model-value="onSurfaceModeChange"
      />
    </div>

    <div class="py-3 border-t-[0.5px] border-[var(--md-outline-variant)]">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-[12px] font-semibold">主题色</span>
        <b class="font-mono text-[12px] font-medium text-[var(--md-on-surface-variant)]">{{ themeLabel }}</b>
      </div>
      <ThemeSwatchGrid />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { THEME_OPTIONS, useThemeStore } from '../stores/theme.js';
import MdSegmentedControl from './MdSegmentedControl.vue';
import ThemeSwatchGrid from './ThemeSwatchGrid.vue';

const theme = useThemeStore();

const modes = [
  { value: 'light', label: '白昼', title: '纯净白昼模式' },
  { value: 'dark', label: '夜间', title: '深邃夜间模式' },
  { value: 'warm', label: '护眼', title: '暖色护眼模式' }
];

const modeLabel = computed(() => (modes.find(m => m.value === theme.surfaceMode) || modes[0]).label);
const themeLabel = computed(() => (THEME_OPTIONS.find(option => option.name === theme.themeColor) || THEME_OPTIONS[0]).title.replace(' (默认)', ''));

function onSurfaceModeChange(value, origin) {
  theme.setSurfaceMode(value, false, origin);
}
</script>
