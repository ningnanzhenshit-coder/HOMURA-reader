<template>
  <Transition
    enter-active-class="md-fade-enter-active"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="md-fade-leave-active"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="ui.collectionTocOpen" class="absolute inset-0 z-40 md-scrim" @click="ui.closeCollectionToc()"></div>
  </Transition>

  <Transition
    enter-active-class="md-sheet-enter-active"
    :enter-from-class="isCompact ? 'translate-y-full' : 'translate-x-full'"
    :enter-to-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
    leave-active-class="md-sheet-leave-active"
    :leave-from-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
    :leave-to-class="isCompact ? 'translate-y-full' : 'translate-x-full'"
    @after-enter="revealActiveBook"
  >
    <aside
      v-if="ui.collectionTocOpen && reader.currentCollection"
      ref="sheetRef"
      id="reader-collection-drawer"
      class="md-drawer"
      aria-labelledby="collection-reading-title"
    >
      <ReaderDrawerHeader
        :is-compact="isCompact"
        title="本目录"
        :subtitle="collectionSubtitle"
        title-id="collection-reading-title"
        close-label="关闭本目录"
        @close="ui.closeCollectionToc()"
        @drag-start="onDragStart"
        @drag-move="onDragMove"
        @drag-end="onDragEnd"
        @drag-cancel="onDragCancel"
      />

      <nav class="md-drawer-body px-3 pb-4 pt-1" aria-label="本书库书本顺序">
        <ol class="flex flex-col gap-1">
          <li v-for="(book, index) in reader.collectionBooks" :key="book.id">
            <button
              type="button"
              class="md-drawer-list-item"
              :class="{ 'is-active': book.id === reader.currentBook.id }"
              :aria-current="book.id === reader.currentBook.id ? 'true' : undefined"
              :aria-label="`打开书库书本：${book.title}`"
              :disabled="reader.openingBook"
              :title="book.title"
              @click="openBook(book.id)"
            >
              <span class="md-drawer-item-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="md-drawer-item-label break-words">{{ book.title }}</span>
              <span v-if="book.id === reader.currentBook.id" class="md-drawer-item-meta">正在阅读</span>
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
import ReaderDrawerHeader from './ReaderDrawerHeader.vue';

const reader = useReaderStore();
const ui = useUiStore();
const { isCompact } = useViewport();
const {
  sheetRef,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel
} = useSheetDrag({
  isCompact,
  isOpen: computed(() => ui.collectionTocOpen),
  onClose: () => ui.closeCollectionToc()
});
const collectionSubtitle = computed(() => {
  if (!reader.currentCollection) return '';
  return `${reader.currentCollection.title} · ${reader.collectionBooks.length} 本`;
});

// 只滚抽屉自身：scrollIntoView 会连带滚动 overflow:hidden 的阅读器祖先，入场动画期间会把画面顶偏。
function revealActiveBook() {
  const body = sheetRef.value?.querySelector('.md-drawer-body');
  const active = body?.querySelector('[aria-current="true"]');
  if (!body || !active) return;
  const bodyRect = body.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  if (activeRect.top < bodyRect.top) {
    body.scrollTop -= bodyRect.top - activeRect.top;
  } else if (activeRect.bottom > bodyRect.bottom) {
    body.scrollTop += activeRect.bottom - bodyRect.bottom;
  }
}

watch(() => ui.collectionTocOpen, async open => {
  if (!open) return;
  await nextTick();
  revealActiveBook();
});

async function openBook(id) {
  if (await reader.openCollectionBook(id)) ui.closeCollectionToc();
}
</script>
