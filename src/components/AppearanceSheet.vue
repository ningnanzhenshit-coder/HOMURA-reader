<template>
  <!-- 外观浮层：桌面顶栏右上角弹出卡片 / 手机底部 sheet -->
  <Transition
    enter-active-class="md-fade-enter-active"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="md-fade-leave-active"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-40"
      :class="isCompact ? 'md-scrim-soft' : ''"
      @click="open = false"
    ></div>
  </Transition>

  <Transition
    enter-active-class="md-sheet-enter-active"
    :enter-from-class="isCompact ? 'translate-y-full opacity-0' : 'translate-y-2 opacity-0'"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="md-sheet-leave-active"
    leave-from-class="translate-y-0 opacity-100"
    :leave-to-class="isCompact ? 'translate-y-full opacity-0' : 'translate-y-2 opacity-0'"
  >
    <div
      v-if="open"
      ref="sheetRef"
      class="fixed z-50 bg-[var(--md-surface-container)] shadow-2xl"
      :class="isCompact
        ? 'inset-x-0 bottom-0 max-h-[78dvh] overflow-y-auto overscroll-contain rounded-t-[28px] px-5 pt-2.5'
        : 'right-[28px] top-[68px] w-[280px] max-h-[calc(100dvh-92px)] overflow-y-auto overscroll-contain rounded-[20px] p-4'"
      :style="isCompact ? 'padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));' : null"
    >
      <div
        v-if="isCompact"
        class="mobile-sheet-drag-zone -mx-5 -mt-2.5 h-9 flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing"
        @pointerdown="onSheetDragStart"
        @pointermove="onSheetDragMove"
        @pointerup="onSheetDragEnd"
        @pointercancel="onSheetDragCancel"
      >
        <div class="w-8 h-1 rounded-full bg-[var(--md-outline-variant)]"></div>
      </div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-[17px] font-semibold">外观设置</h3>
        <button
          @click="open = false"
          class="md-hit-target w-10 h-10 -mr-1 rounded-full grid place-items-center text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-high)] transition-colors"
          title="关闭"
          aria-label="关闭外观设置"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <AppearancePanel />
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { useViewport } from '../composables/useViewport.js';
import { useSheetDrag } from '../composables/useSheetDrag.js';
import AppearancePanel from './AppearancePanel.vue';

const { isCompact } = useViewport();
const props = defineProps({
  open: { type: Boolean, default: false }
});
const emit = defineEmits(['update:open']);

const open = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
});

const {
  sheetRef,
  onDragStart: onSheetDragStart,
  onDragMove: onSheetDragMove,
  onDragEnd: onSheetDragEnd,
  onDragCancel: onSheetDragCancel
} = useSheetDrag({
  isCompact,
  isOpen: open,
  onClose: () => {
    open.value = false;
  }
});
</script>
