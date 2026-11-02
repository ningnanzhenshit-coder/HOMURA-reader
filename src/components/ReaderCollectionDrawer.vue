<template>
  <Transition enter-active-class="md-fade-enter-active" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="md-fade-leave-active" leave-from-class="opacity-100" leave-to-class="opacity-0">
    <div v-if="ui.collectionTocOpen" class="absolute inset-0 z-40 md-scrim" @click="ui.closeCollectionToc()"></div>
  </Transition>
  <Transition enter-active-class="md-sheet-enter-active" :enter-from-class="isCompact ? 'translate-y-full' : 'translate-x-full'" enter-to-class="translate-x-0 translate-y-0" leave-active-class="md-sheet-leave-active" leave-from-class="translate-x-0 translate-y-0" :leave-to-class="isCompact ? 'translate-y-full' : 'translate-x-full'">
    <aside v-if="ui.collectionTocOpen && reader.currentCollection" ref="sheetRef" class="absolute z-50 flex flex-col bg-[var(--md-surface-container)] text-[var(--md-on-surface)] shadow-2xl" :class="isCompact ? 'inset-x-0 bottom-0 w-full max-h-[78dvh] rounded-t-[28px]' : 'inset-y-0 right-0 w-[372px] max-w-[92%] h-full rounded-l-[28px]'" :style="isCompact ? { paddingBottom: 'env(safe-area-inset-bottom)' } : null" aria-labelledby="collection-reading-title">
      <div v-if="isCompact" class="mobile-sheet-drag-zone h-9 shrink-0 flex items-center justify-center touch-none select-none" @pointerdown="onDragStart" @pointermove="onDragMove" @pointerup="onDragEnd" @pointercancel="onDragCancel"><span class="w-8 h-1 rounded-full bg-[var(--md-outline-variant)]"></span></div>
      <div class="px-4 pt-3 pb-2 flex items-center gap-3 shrink-0">
        <div class="flex-1 min-w-0"><h3 id="collection-reading-title" class="text-[17px] font-semibold">本目录</h3><p class="mt-1 text-[11px] text-[var(--md-on-surface-variant)] truncate">{{ reader.currentCollection.title }} · {{ reader.collectionBooks.length }} 本</p></div>
        <button class="w-11 h-11 rounded-full grid place-items-center text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-high)]" aria-label="关闭本目录" title="关闭本目录" @click="ui.closeCollectionToc()"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <nav class="px-3 py-2 overflow-y-auto overscroll-contain flex-1 min-h-0" aria-label="本书库书本顺序">
        <ol class="flex flex-col gap-1">
          <li v-for="(book, index) in reader.collectionBooks" :key="book.id">
            <button class="w-full min-h-11 px-3 py-3 flex items-center gap-3 rounded-xl text-left text-[13px] transition-colors duration-200" :class="book.id === reader.currentBook.id ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]' : 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-high)]'" :aria-current="book.id === reader.currentBook.id ? 'true' : undefined" :aria-label="`打开书库书本：${book.title}`" :disabled="reader.openingBook" @click="openBook(book.id)">
              <span class="font-mono text-[11px] shrink-0">{{ index + 1 }}</span><span class="min-w-0 flex-1 break-words">{{ book.title }}</span><span v-if="book.id === reader.currentBook.id" class="text-[11px] shrink-0">正在阅读</span>
            </button>
          </li>
        </ol>
      </nav>
    </aside>
  </Transition>
</template>

<script setup>
import { computed, watch, nextTick } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';
import { useSheetDrag } from '../composables/useSheetDrag.js';

const reader = useReaderStore();
const ui = useUiStore();
const { isCompact } = useViewport();
const { sheetRef, onDragStart, onDragMove, onDragEnd, onDragCancel } = useSheetDrag({ isCompact, isOpen: computed(() => ui.collectionTocOpen), onClose: () => ui.closeCollectionToc() });

watch(() => ui.collectionTocOpen, async open => {
  if (!open) return;
  await nextTick();
  sheetRef.value?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
});

async function openBook(id) {
  if (await reader.openCollectionBook(id)) ui.closeCollectionToc();
}
</script>
