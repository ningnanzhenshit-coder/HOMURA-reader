<template>
  <button
    type="button"
    role="switch"
    class="md-switch-row"
    :aria-checked="modelValue"
    :title="title || undefined"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span class="md-switch-label"><slot /></span>
    <span class="md-switch-track" :class="{ 'is-checked': modelValue }" aria-hidden="true">
      <span class="md-switch-thumb">
        <i class="md-switch-knob"></i>
      </span>
    </span>
  </button>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' }
});

defineEmits(['update:modelValue']);
</script>

<style scoped>
.md-switch-row {
  display: flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  color: var(--md-on-surface);
  text-align: left;
  cursor: pointer;
}

.md-switch-track {
  position: relative;
  display: block;
  width: 36px;
  height: 20px;
  flex: none;
  border-radius: 999px;
  background-color: var(--md-outline-variant);
  /* 轨道换色：快起步、缓停 */
  transition: background-color var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}

.md-switch-track.is-checked {
  background-color: var(--md-primary);
}

/* thumb 只负责位移，滑块颜色与按压缩放交给内部 knob */
.md-switch-thumb {
  --md-switch-travel: 0px;
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  transform: translate3d(var(--md-switch-travel), 0, 0);
  /* 行程只有 16px：带一点过冲回弹，短距位移才有「弹一下」的手感 */
  transition: transform var(--md-duration-medium, 280ms) var(--md-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  will-change: transform;
}

.md-switch-knob {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: var(--md-on-surface);
  transition:
    transform var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1)),
    background-color var(--md-duration-short, 200ms) var(--md-ease-decelerate, cubic-bezier(0.05, 0.7, 0.1, 1));
}

.md-switch-track.is-checked .md-switch-thumb {
  --md-switch-travel: 16px;
}

.md-switch-track.is-checked .md-switch-knob {
  background-color: var(--md-on-primary);
}

/* 按下时轻微拉伸，松开后弹回，给滑块一点触感 */
.md-switch-row:active .md-switch-knob {
  transform: scaleX(1.12);
}

@media (prefers-reduced-motion: reduce) {
  .md-switch-track,
  .md-switch-thumb,
  .md-switch-knob {
    transition: none;
  }

  .md-switch-row:active .md-switch-knob {
    transform: none;
  }
}
</style>
