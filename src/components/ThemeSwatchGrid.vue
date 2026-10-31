<template>
  <div class="theme-swatch-grid" role="group" aria-label="主题色">
    <button
      v-for="option in THEME_OPTIONS"
      :key="option.name"
      type="button"
      class="theme-swatch-tile"
      :class="{ 'is-selected': theme.themeColor === option.name }"
      :title="option.title"
      :aria-label="option.title"
      :aria-pressed="theme.themeColor === option.name"
      @click="theme.setThemeColor(option.name)"
    >
      <span class="theme-swatch-disc" :style="swatchStyle(option)" aria-hidden="true"></span>
      <span v-if="theme.themeColor === option.name" class="theme-swatch-check" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3.2 8.4l3 3 6.6-7" />
        </svg>
      </span>
    </button>
  </div>
</template>

<script setup>
import { THEME_OPTIONS, useThemeStore } from '../stores/theme.js';

const theme = useThemeStore();

function swatchStyle(option) {
  const [light, base, deep] = option.tones;
  return {
    '--swatch-light': light,
    '--swatch-base': base,
    '--swatch-deep': deep
  };
}
</script>
