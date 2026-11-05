<template>
  <input
    class="md-range"
    type="range"
    :class="{ 'rtl-slider': rtl }"
    :min="min"
    :max="max"
    :step="step"
    :value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel || undefined"
    :aria-valuetext="ariaValueText || undefined"
    :style="{ '--md-range-progress': `${progress}%` }"
    @input="onInput"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: [Number, String], required: true },
  min: { type: [Number, String], default: 0 },
  max: { type: [Number, String], default: 100 },
  step: { type: [Number, String], default: 1 },
  disabled: { type: Boolean, default: false },
  rtl: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
  ariaValueText: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// 拖动时先更新本地值，让活动轨道紧跟手柄，不等父级下一帧回写。
const currentValue = ref(toNumber(props.modelValue));

watch(() => props.modelValue, value => {
  currentValue.value = toNumber(value);
});

const progress = computed(() => {
  const min = toNumber(props.min);
  const max = toNumber(props.max);
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((currentValue.value - min) / (max - min)) * 100));
});

function onInput(event) {
  const value = Number(event.target.value);
  currentValue.value = value;
  emit('update:modelValue', value);
}
</script>
