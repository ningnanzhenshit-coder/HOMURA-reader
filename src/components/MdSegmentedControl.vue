<template>
  <div
    class="md-segmented"
    :class="{ 'has-selection': activeIndex >= 0 }"
    role="group"
    :aria-label="ariaLabel || undefined"
    :style="{
      '--md-segment-count': Math.max(1, options.length),
      '--md-segment-index': Math.max(0, activeIndex)
    }"
  >
    <span class="md-segmented-thumb" aria-hidden="true"></span>
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="md-segmented-option md-hit-target"
      :class="{ 'is-selected': option.value === modelValue }"
      :aria-pressed="option.value === modelValue"
      :title="option.title || undefined"
      @click="select(option.value, $event)"
    >{{ option.label }}</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number], required: true },
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);

const activeIndex = computed(() => props.options.findIndex(option => option.value === props.modelValue));

function select(value, event) {
  if (value === props.modelValue) return;
  const rect = event?.currentTarget?.getBoundingClientRect?.();
  const origin = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : null;
  emit('update:modelValue', value, origin);
}
</script>

<style scoped>
.md-segmented {
  position: relative;
  display: flex;
  align-items: center;
  padding: 3px;
  border-radius: 20px;
  background-color: var(--md-segmented-bg, var(--md-surface-high));
  isolation: isolate;
}

.md-segmented-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  z-index: 0;
  width: calc((100% - 6px) / var(--md-segment-count, 1));
  border-radius: 17px;
  background-color: var(--md-primary);
  opacity: 0;
  transform: translate3d(calc(var(--md-segment-index, 0) * 100%), 0, 0);
  /* 胶囊整格位移：强调减速 + 轻微过冲，落位时收得住又带一点弹性 */
  transition:
    transform var(--md-duration-medium, 280ms) var(--md-ease-expressive, cubic-bezier(0.22, 1.2, 0.36, 1)),
    opacity var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
  will-change: transform;
}

.md-segmented.has-selection .md-segmented-thumb {
  opacity: 1;
}

.md-segmented-option {
  position: relative;
  z-index: 1;
  min-width: 0;
  flex: 1 1 0;
  padding: 7px 8px;
  border-radius: 17px;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  cursor: pointer;
  /* 文字换色比滑块略快，避免「字还没变色胶囊已经到了」 */
  transition:
    color var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1)),
    background-color var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1)),
    opacity var(--md-duration-short, 200ms) var(--md-ease-emphasized, cubic-bezier(0.2, 0, 0, 1));
}

.md-segmented-option.is-selected {
  color: var(--md-on-primary);
}

.md-segmented-option:active {
  opacity: 0.72;
}

@media (hover: hover) and (pointer: fine) {
  .md-segmented-option:not(.is-selected):hover {
    color: var(--md-on-surface);
    background-color: color-mix(in oklab, var(--md-on-surface) 6%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .md-segmented-thumb,
  .md-segmented-option {
    transition: none;
  }
}
</style>
