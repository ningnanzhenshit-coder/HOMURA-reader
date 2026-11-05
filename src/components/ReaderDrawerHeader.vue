<template>
  <div
    v-if="isCompact"
    class="mobile-sheet-drag-zone h-9 flex shrink-0 cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing"
    @pointerdown="$emit('drag-start', $event)"
    @pointermove="$emit('drag-move', $event)"
    @pointerup="$emit('drag-end', $event)"
    @pointercancel="$emit('drag-cancel', $event)"
  >
    <span class="h-1 w-8 rounded-full bg-[var(--md-outline-variant)]"></span>
  </div>

  <header class="md-drawer-header">
    <div class="md-drawer-heading">
      <h2 :id="titleId" class="md-drawer-title">{{ title }}</h2>
      <p v-if="subtitle" class="md-drawer-subtitle" :title="subtitle">{{ subtitle }}</p>
    </div>
    <button
      type="button"
      class="md-icon-button"
      :title="closeLabel"
      :aria-label="closeLabel"
      @click="$emit('close')"
    >
      <MdIcon name="close" />
    </button>
  </header>
</template>

<script setup>
import MdIcon from './MdIcon.vue';

defineProps({
  isCompact: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  titleId: { type: String, required: true },
  closeLabel: { type: String, default: '关闭' }
});

defineEmits(['close', 'drag-start', 'drag-move', 'drag-end', 'drag-cancel']);
</script>
