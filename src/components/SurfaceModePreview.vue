<template>
  <div class="surface-mode-preview" role="group" aria-label="阅读模式">
    <button
      v-for="option in SURFACE_MODE_OPTIONS"
      :key="option.value"
      type="button"
      class="surface-mode-option"
      :class="{ 'is-selected': theme.surfaceMode === option.value }"
      :title="option.title"
      :aria-label="`${option.label}：${option.note}`"
      :aria-pressed="theme.surfaceMode === option.value"
      @click="selectMode(option.value, $event)"
    >
      <span
        class="surface-mode-card"
        :class="{ 'is-selected': theme.surfaceMode === option.value }"
        :data-theme="theme.themeColor"
        :data-mode="option.value"
      >
        <span class="surface-mode-sheet" aria-hidden="true">
          <span class="surface-mode-palette"><i></i><i></i><i></i></span>
          <span class="surface-mode-copy-block"><i></i><i></i><i></i></span>
          <span class="surface-mode-footer"><i></i><i></i></span>
        </span>
        <span v-if="theme.surfaceMode === option.value" class="surface-mode-check" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M3.2 8.4l3 3 6.6-7" />
          </svg>
        </span>
      </span>

      <span class="surface-mode-meta">
        <span class="surface-mode-icon" aria-hidden="true">
          <svg v-if="option.value === 'light'" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <circle cx="10" cy="10" r="3" stroke-width="1.7" />
            <path
              stroke-linecap="round"
              stroke-width="1.7"
              d="M10 2.3v2.1M10 15.6v2.1M2.3 10h2.1M15.6 10h2.1M4.55 4.55l1.5 1.5M13.95 13.95l1.5 1.5M15.45 4.55l-1.5 1.5M6.05 13.95l-1.5 1.5"
            />
          </svg>
          <svg v-else-if="option.value === 'dark'" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.7"
              d="M14.8 12.8A6.2 6.2 0 0 1 7.2 5.2a6.3 6.3 0 1 0 7.6 7.6Z"
            />
          </svg>
          <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.7"
              d="M2.4 10s2.6-4.1 7.6-4.1 7.6 4.1 7.6 4.1-2.6 4.1-7.6 4.1S2.4 10 2.4 10Z"
            />
            <circle cx="10" cy="10" r="2.2" stroke-width="1.7" />
          </svg>
        </span>
        <span class="surface-mode-note">{{ option.note }}</span>
      </span>
    </button>
  </div>
</template>

<script setup>
import { SURFACE_MODE_OPTIONS, useThemeStore } from '../stores/theme.js';

const theme = useThemeStore();

function selectMode(mode, event) {
  if (mode === theme.surfaceMode) return;
  const rect = event.currentTarget.getBoundingClientRect();
  theme.setSurfaceMode(mode, false, {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  });
}
</script>

<style scoped>
.surface-mode-preview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 280px;
  margin-inline: auto;
}

.surface-mode-option {
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--md-on-surface);
  text-align: left;
  cursor: pointer;
}

.surface-mode-card {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 0.72;
  padding: 5px;
  overflow: hidden;
  border: 0.5px solid color-mix(in oklab, var(--md-outline-variant) 72%, transparent);
  border-radius: 16px;
  background: color-mix(in oklab, var(--md-surface-container) 84%, transparent);
  box-shadow: 0 10px 22px -18px color-mix(in oklab, var(--md-on-surface) 32%, transparent);
  transition:
    transform var(--md-duration-short) var(--md-ease-emphasized),
    box-shadow var(--md-duration-short) var(--md-ease-emphasized),
    border-color var(--md-duration-short) var(--md-ease-emphasized);
}

.surface-mode-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px;
  overflow: hidden;
  border-radius: 11px;
  background: var(--md-surface);
  box-shadow: inset 0 0 0 0.5px color-mix(in oklab, var(--md-outline-variant) 58%, transparent);
}

.surface-mode-palette {
  display: grid;
  grid-template-columns: 1.15fr 0.88fr 1.1fr;
  height: 27px;
  overflow: hidden;
  border-radius: 7px;
}

.surface-mode-palette i:nth-child(1) {
  background: var(--md-primary);
}

.surface-mode-palette i:nth-child(2) {
  background: var(--md-tertiary);
}

.surface-mode-palette i:nth-child(3) {
  background: var(--md-secondary);
}

.surface-mode-copy-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 13px;
}

.surface-mode-copy-block i {
  display: block;
  height: 5px;
  border-radius: 999px;
}

.surface-mode-copy-block i:nth-child(1) {
  width: 67%;
  background: var(--md-primary-container);
}

.surface-mode-copy-block i:nth-child(2) {
  width: 49%;
  background: var(--md-secondary-container);
}

.surface-mode-copy-block i:nth-child(3) {
  width: 84%;
  margin-top: 7px;
  background: var(--md-tertiary-container);
}

.surface-mode-footer {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: auto;
}

.surface-mode-footer i:first-child {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  border-radius: 50%;
  background: var(--md-primary);
}

.surface-mode-footer i:last-child {
  height: 17px;
  flex: 1;
  border-radius: 999px;
  background: var(--md-primary-container);
}

.surface-mode-check {
  position: absolute;
  top: 7px;
  right: 7px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--md-surface-container);
  color: var(--md-on-surface);
  box-shadow: 0 1px 4px color-mix(in oklab, var(--md-on-surface) 20%, transparent);
}

.surface-mode-check svg {
  width: 10px;
  height: 10px;
}

.surface-mode-card.is-selected {
  border-color: var(--md-primary);
  box-shadow:
    0 0 0 1.5px var(--md-primary),
    0 12px 24px -18px color-mix(in oklab, var(--md-primary) 56%, transparent);
}

.surface-mode-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  margin-top: 8px;
  padding-inline: 2px;
}

.surface-mode-icon {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  color: var(--md-on-surface);
}

.surface-mode-icon svg {
  display: block;
  width: 16px;
  height: 16px;
}

.surface-mode-option.is-selected .surface-mode-icon {
  color: var(--md-primary);
}

.surface-mode-note {
  min-width: 0;
  overflow: hidden;
  color: var(--md-on-surface-variant);
  font-size: 8px;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.surface-mode-option:focus-visible {
  outline: none;
}

.surface-mode-option:focus-visible .surface-mode-card {
  outline: 2px solid var(--md-primary);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .surface-mode-option:hover .surface-mode-card {
    transform: translateY(-2px);
    box-shadow: 0 16px 26px -20px color-mix(in oklab, var(--md-on-surface) 38%, transparent);
  }

  .surface-mode-option.is-selected:hover .surface-mode-card {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .surface-mode-card {
    transition: none;
  }

  .surface-mode-option:hover .surface-mode-card {
    transform: none;
  }
}
</style>
