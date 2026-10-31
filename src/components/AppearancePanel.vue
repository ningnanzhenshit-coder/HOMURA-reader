<template>
  <!-- 外观设置面板内容：主题色 + 阅读模式（桌面浮层 / 手机底部 sheet 共用） -->
  <div>
    <div class="py-3 border-t-[0.5px] border-[var(--md-outline-variant)]">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-[12px] font-semibold">阅读模式</span>
        <b class="font-mono text-[12px] font-medium text-[var(--md-on-surface-variant)]">{{ modeLabel }}</b>
      </div>
      <SurfaceModePreview />
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
import { SURFACE_MODE_OPTIONS, THEME_OPTIONS, useThemeStore } from '../stores/theme.js';
import SurfaceModePreview from './SurfaceModePreview.vue';
import ThemeSwatchGrid from './ThemeSwatchGrid.vue';

const theme = useThemeStore();

const modeLabel = computed(() => (SURFACE_MODE_OPTIONS.find(option => option.value === theme.surfaceMode) || SURFACE_MODE_OPTIONS[0]).label);
const themeLabel = computed(() => (THEME_OPTIONS.find(option => option.name === theme.themeColor) || THEME_OPTIONS[0]).title.replace(' (默认)', ''));
</script>
