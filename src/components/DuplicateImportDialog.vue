<template>
  <dialog
    ref="dialogRef"
    class="duplicate-import-dialog bg-[var(--md-surface-container)] text-[var(--md-on-surface)] shadow-2xl"
    aria-labelledby="duplicate-import-title"
    aria-describedby="duplicate-import-description"
    @cancel.prevent="resolveImport()"
    @click="onBackdropClick"
    @keydown.stop="onKeydown"
  >
    <div v-if="pendingDuplicate" class="p-6">
      <div class="min-[900px]:hidden w-8 h-1 rounded-full bg-[var(--md-outline-variant)] mx-auto mb-5" aria-hidden="true"></div>
      <h2 id="duplicate-import-title" class="text-[17px] font-semibold">发现同名书本</h2>
      <div id="duplicate-import-description" class="mt-3 text-[13px] leading-relaxed text-[var(--md-on-surface-variant)]">
        <p class="break-words">书架中已有《{{ pendingDuplicate.existingTitle }}》。</p>
        <p class="mt-2 break-words">是否仍要导入《{{ pendingDuplicate.title }}》？仍然导入会保留为独立书本。</p>
      </div>
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button
          class="min-h-11 px-4 rounded-full text-[13px] font-semibold text-[var(--md-primary)] hover:bg-[var(--md-surface-high)] transition-colors duration-200"
          @click="resolveImport(true)"
        >仍然导入</button>
        <button
          ref="skipButtonRef"
          autofocus
          class="min-h-11 px-4 rounded-full text-[13px] font-semibold bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] hover:bg-[var(--md-surface-high)] transition-colors duration-200"
          @click="resolveImport()"
        >跳过此书</button>
      </div>
    </div>
  </dialog>
</template>

<script setup>
import { shallowRef, watch, nextTick, onBeforeUnmount } from 'vue';
import { useDuplicateImport } from '../composables/useDuplicateImport.js';

const dialogRef = shallowRef(null);
const skipButtonRef = shallowRef(null);
const { pendingDuplicate, resolveImport } = useDuplicateImport();

watch(pendingDuplicate, async pending => {
  if (!pending) {
    dialogRef.value?.close();
    return;
  }
  await nextTick();
  if (!pendingDuplicate.value) return;
  if (!dialogRef.value.open) dialogRef.value.showModal();
  skipButtonRef.value?.focus();
});

function onBackdropClick(event) {
  if (event.target !== dialogRef.value) return;
  const bounds = dialogRef.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
    resolveImport();
  }
}

function onKeydown(event) {
  if (event.key !== 'Tab') return;
  const buttons = dialogRef.value.querySelectorAll('button');
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onBeforeUnmount(() => resolveImport());
</script>

<style scoped>
.duplicate-import-dialog {
  position: fixed;
  inset: auto 0 0;
  margin: 0;
  width: 100%;
  max-width: none;
  max-height: 78dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 0;
  border-radius: 28px 28px 0 0;
  padding: 0 0 env(safe-area-inset-bottom);
}

.duplicate-import-dialog::backdrop {
  background: color-mix(in oklab, var(--md-on-surface) 32%, transparent);
}

@media (min-width: 900px) {
  .duplicate-import-dialog {
    inset: 0;
    margin: auto;
    width: 372px;
    border-radius: 28px;
    padding: 0;
  }
}
</style>
