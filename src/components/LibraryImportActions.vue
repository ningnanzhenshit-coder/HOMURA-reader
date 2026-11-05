<template>
  <div :class="compact ? 'relative flex items-center' : 'md-fab-pos flex flex-col items-end'">
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
        class="absolute right-0 w-60 z-30 md-menu"
        :class="compact ? 'top-full mt-2' : 'bottom-[calc(100%+12px)]'"
        role="menu"
        aria-label="导入与书库"
      >
        <p role="presentation" class="md-menu-label">导入作品</p>
        <button type="button" role="menuitem" class="md-menu-item" @click="choose('pick-files')">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v11M8 10l4 4 4-4M4 17v3h16v-3"/>
          </svg>
          <span class="flex-1">导入文件</span>
        </button>
        <button v-if="canPickFolder" type="button" role="menuitem" class="md-menu-item" @click="choose('pick-folder')">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
          <span class="flex-1">导入文件夹</span>
        </button>
        <button type="button" role="menuitem" class="md-menu-item" @click="choose('create-collection')">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v11h18V8h-6l-2-2H3v1m9 4v6m-3-3h6"/>
          </svg>
          <span class="flex-1">新建书库</span>
        </button>
      </div>
    </Transition>

    <button
      type="button"
      class="import-fab relative z-10"
      :class="{ 'is-compact': compact, 'is-open': open }"
      title="导入作品"
      aria-label="导入作品"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="$emit('update:open', !open)"
    >
      <svg :class="compact ? 'w-5 h-5' : 'w-6 h-6'" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 3v11M8 10l4 4 4-4M4 17v3h16v-3"/>
      </svg>
      <span v-if="!compact">导入</span>
    </button>
  </div>
</template>

<script setup>
import { canPickFolder } from '../services/platform.js';

defineProps({
  compact: Boolean,
  open: Boolean
});
const emit = defineEmits(['update:open', 'create-collection', 'pick-files', 'pick-folder']);

function choose(action) {
  emit('update:open', false);
  emit(action);
}
</script>

<style scoped>
.import-fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  padding: 0 20px;
  gap: 12px;
  border: 0;
  border-radius: 16px;
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
  font-size: 13px;
  font-weight: 600;
  box-shadow:
    0 2px 4px -2px color-mix(in oklab, var(--md-shadow-color) 28%, transparent),
    0 6px 16px -8px color-mix(in oklab, var(--md-shadow-color) 38%, transparent);
  transition:
    background-color 200ms cubic-bezier(0.2, 0, 0, 1),
    box-shadow 200ms cubic-bezier(0.2, 0, 0, 1);
}

.import-fab.is-open {
  background: color-mix(in oklab, var(--md-primary-container) 92%, var(--md-on-primary-container));
  box-shadow:
    0 2px 6px -2px color-mix(in oklab, var(--md-shadow-color) 30%, transparent),
    0 10px 24px -10px color-mix(in oklab, var(--md-shadow-color) 42%, transparent);
}

@media (hover: hover) and (pointer: fine) {
  .import-fab:hover {
    background: color-mix(in oklab, var(--md-primary-container) 92%, var(--md-on-primary-container));
    box-shadow:
      0 2px 6px -2px color-mix(in oklab, var(--md-shadow-color) 30%, transparent),
      0 10px 24px -10px color-mix(in oklab, var(--md-shadow-color) 42%, transparent);
  }
}

.import-fab:active {
  background: color-mix(in oklab, var(--md-primary-container) 86%, var(--md-on-primary-container));
}

.import-fab.is-compact {
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 999px;
  box-shadow: none;
}

.import-fab.is-compact.is-open {
  box-shadow: none;
}

@media (hover: hover) and (pointer: fine) {
  .import-fab.is-compact:hover {
    box-shadow: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .import-fab {
    transition: none;
  }
}
</style>
