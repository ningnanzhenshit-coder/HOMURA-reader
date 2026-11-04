<template>
  <div :class="compact ? 'relative flex items-center gap-0.5' : 'md-fab-pos flex flex-col items-end'">
    <div v-if="open" class="fixed inset-0 z-20" @click="$emit('update:open', false)"></div>
    <Transition
      enter-active-class="md-sheet-enter-active"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="md-sheet-leave-active"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="open"
        class="absolute right-0 w-56 z-30 rounded-2xl bg-[var(--md-surface-container)] shadow-xl p-1.5 flex flex-col gap-0.5"
        :class="compact ? 'top-full mt-1' : 'bottom-[136px]'"
        role="menu"
        aria-label="导入作品"
      >
        <p role="presentation" class="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-[var(--md-on-surface-variant)]">导入作品</p>
        <button type="button" @click="$emit('pick-files')" role="menuitem" class="md-mobile-menu-item w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-xs font-semibold text-left transition-colors hover:bg-[var(--md-surface-high)]">
          <svg class="w-4 h-4 shrink-0 text-[var(--md-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v11M8 8l4-4 4 4"/></svg>
          <span class="flex-1">导入文件</span>
        </button>
        <button v-if="canPickFolder" type="button" @click="$emit('pick-folder')" role="menuitem" class="md-mobile-menu-item w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-xs font-semibold text-left transition-colors hover:bg-[var(--md-surface-high)]">
          <svg class="w-4 h-4 shrink-0 text-[var(--md-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          <span class="flex-1">导入文件夹</span>
        </button>
      </div>
    </Transition>

    <button
      type="button"
      @click="$emit('create-collection')"
      class="relative z-10"
      :class="compact
        ? 'w-11 h-11 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors'
        : 'inline-flex items-center justify-center mb-3 h-14 px-5 gap-2.5 rounded-2xl text-[13px] font-bold bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] active:scale-95 transition-transform duration-200'"
      title="新建书库"
      aria-label="新建书库"
    >
      <svg :class="compact ? 'w-5 h-5' : 'w-6 h-6'" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="compact ? 'M3 7v12h18V8H11L9 5H3v2m9 4v6m-3-3h6' : 'M12 5v14M5 12h14'"/>
      </svg>
      <span v-if="!compact">新建</span>
    </button>
    <button
      type="button"
      @click="openImport"
      class="relative z-10"
      :class="compact
        ? [
            'w-11 h-11 rounded-full grid place-items-center transition-colors',
            open
              ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]'
              : 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)]'
          ]
        : 'inline-flex items-center justify-center h-14 rounded-2xl px-5 gap-2.5 text-[13px] font-bold bg-[var(--md-primary)] text-[var(--md-on-primary)] shadow-md active:scale-95 transition-transform duration-200'"
      title="导入作品"
      aria-label="导入作品"
      :aria-haspopup="canPickFolder ? 'menu' : undefined"
      :aria-expanded="canPickFolder ? open : undefined"
    >
      <svg :class="compact ? 'w-5 h-5' : 'w-6 h-6'" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" :d="compact ? 'M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4' : 'M12 5v14M5 12h14'"/>
      </svg>
      <span v-if="!compact">导入</span>
    </button>
  </div>
</template>

<script setup>
import { canPickFolder } from '../services/platform.js';

const props = defineProps({
  compact: Boolean,
  open: Boolean
});
const emit = defineEmits(['update:open', 'create-collection', 'pick-files', 'pick-folder']);

function openImport() {
  if (canPickFolder) emit('update:open', !props.open);
  else emit('pick-files');
}
</script>
