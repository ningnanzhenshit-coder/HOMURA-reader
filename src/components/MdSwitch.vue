<template>
  <button
    type="button"
    role="switch"
    class="md-switch-row"
    :class="{ 'is-checked': modelValue }"
    :aria-checked="modelValue"
    :disabled="disabled"
    :title="title || undefined"
    @click="toggle"
  >
    <span class="md-switch-label"><slot /></span>
    <span class="md-switch-track" aria-hidden="true">
      <span class="md-switch-state-layer"></span>
      <span class="md-switch-thumb"><i class="md-switch-knob"></i></span>
    </span>
  </button>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue']);

function toggle() {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<style scoped>
.md-switch-row {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--md-on-surface);
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.md-switch-row:disabled {
  cursor: default;
  opacity: 0.38;
}

.md-switch-label {
  min-width: 0;
}

.md-switch-track {
  --md-switch-state-color: var(--md-outline);
  position: relative;
  display: block;
  width: 52px;
  height: 32px;
  flex: none;
  border-radius: 999px;
  background-color: var(--md-surface-highest);
  box-shadow: inset 0 0 0 2px var(--md-outline);
  transition:
    background-color var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1)),
    box-shadow var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}

.md-switch-row.is-checked .md-switch-track {
  --md-switch-state-color: var(--md-on-primary);
  background-color: var(--md-primary);
  box-shadow: inset 0 0 0 2px transparent;
}

/* 40px 状态层跟随滑块中心，超出轨道的部分保持可见 */
.md-switch-state-layer {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--md-switch-state-color);
  opacity: 0;
  pointer-events: none;
  transform: translate3d(-6px, -50%, 0);
  transition:
    opacity var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1)),
    background-color var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1)),
    transform var(--md-duration-medium, 280ms) var(--md-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.md-switch-row.is-checked .md-switch-state-layer {
  transform: translate3d(16px, -50%, 0);
}

/* thumb 固定为 24px 容器，只负责位移；knob 用缩放表现 16 / 24 / 28px */
.md-switch-thumb {
  position: absolute;
  z-index: 2;
  top: 4px;
  left: 4px;
  display: block;
  width: 24px;
  height: 24px;
  transform: translate3d(-2px, 0, 0);
  transition: transform var(--md-duration-medium, 280ms) var(--md-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  will-change: transform;
}

.md-switch-row.is-checked .md-switch-thumb {
  transform: translate3d(20px, 0, 0);
}

.md-switch-knob {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: var(--md-outline);
  transform: scale(0.6667);
  transition:
    transform var(--md-duration-medium, 280ms) var(--md-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)),
    background-color var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}

.md-switch-row.is-checked .md-switch-knob {
  background-color: var(--md-on-primary);
  transform: scale(1);
}

.md-switch-row:not(:disabled):active .md-switch-knob {
  transform: scale(1.1667);
}

@media (hover: hover) and (pointer: fine) {
  .md-switch-row:not(:disabled):hover .md-switch-state-layer {
    opacity: 0.08;
  }
}

.md-switch-row:focus-visible {
  outline: none;
}

.md-switch-row:focus-visible .md-switch-state-layer,
.md-switch-row:not(:disabled):active .md-switch-state-layer {
  opacity: 0.1;
}

.md-switch-row:focus-visible .md-switch-track {
  outline: 2px solid var(--md-primary);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .md-switch-track,
  .md-switch-state-layer,
  .md-switch-thumb,
  .md-switch-knob {
    transition: none;
  }
}
</style>
