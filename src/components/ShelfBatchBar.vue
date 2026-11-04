<template>
  <div class="flex flex-1 min-w-0 items-center gap-1.5 min-[430px]:gap-2" role="group" aria-label="书本批量操作">
    <div class="flex-1 min-w-0 min-h-11 px-2 rounded-[22px] flex flex-wrap items-center gap-1 bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]">
      <span class="text-[13px] px-2" aria-live="polite">
        <span class="hidden min-[430px]:inline">{{ label }}</span>
        <span class="min-[430px]:hidden">{{ compactLabel }}</span>
      </span>
      <button class="md-library-text-button batch-action-button" @click="$emit('select-all')">{{ allSelected ? '取消全选' : '全选' }}</button>
      <button class="md-library-text-button batch-action-button" :disabled="moveDisabled" @click="$emit('move')">{{ moveLabel }}</button>
      <button class="md-library-text-button batch-action-button" :class="{ 'batch-delete-button': dangerDelete }" :disabled="deleteDisabled" @click="$emit('delete')">{{ deleteLabel }}</button>
    </div>
    <button
      class="w-11 h-11 shrink-0 rounded-[22px] grid place-items-center bg-[var(--md-secondary-container)] text-[var(--md-primary)]"
      title="取消多选"
      aria-label="取消多选"
      @click="$emit('cancel')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  compactLabel: { type: String, required: true },
  allSelected: { type: Boolean, default: false },
  moveLabel: { type: String, required: true },
  moveDisabled: { type: Boolean, default: false },
  deleteLabel: { type: String, required: true },
  deleteDisabled: { type: Boolean, default: false },
  dangerDelete: { type: Boolean, default: false }
});

defineEmits(['select-all', 'move', 'delete', 'cancel']);
</script>

<style scoped>
.batch-delete-button { color: var(--md-error); }
.batch-action-button {
  min-width: 44px;
  padding-inline: 8px;
  white-space: nowrap;
}
</style>
