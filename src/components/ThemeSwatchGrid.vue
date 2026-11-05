<template>
  <div
    class="theme-swatch-grid"
    :class="{ 'is-wide': wide }"
    :style="{ '--swatch-columns': columns }"
    role="group"
    aria-label="主题色"
  >
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
        <MdIcon name="check" />
      </span>
    </button>
  </div>
</template>

<script setup>
import { THEME_OPTIONS, useThemeStore } from '../stores/theme.js';
import MdIcon from './MdIcon.vue';

defineProps({
  columns: { type: Number, default: 5 },
  wide: { type: Boolean, default: false }
});

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

<style scoped>
.theme-swatch-grid.is-wide {
  grid-template-columns: repeat(var(--swatch-columns, 10), minmax(0, 1fr));
  gap: 8px;
  max-width: none;
}

.theme-swatch-grid.is-wide .theme-swatch-tile {
  min-height: 44px;
  aspect-ratio: auto;
}

.theme-swatch-grid.is-wide .theme-swatch-disc {
  width: 32px;
}
</style>
