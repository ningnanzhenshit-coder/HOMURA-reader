<template>
  <dialog ref="dialogRef" class="md-library-dialog" aria-labelledby="shelf-dialog-title" @cancel.prevent="resolveShelfDialog()" @keydown.stop="onKeydown">
    <form v-if="pendingShelfDialog" class="p-6" @submit.prevent="submitName">
      <div class="min-[900px]:hidden w-8 h-1 mx-auto mb-5 rounded-full bg-[var(--md-outline-variant)]" aria-hidden="true"></div>
      <h2 id="shelf-dialog-title" class="text-[17px] font-semibold">{{ pendingShelfDialog.title }}</h2>
      <p v-if="pendingShelfDialog.message" class="mt-3 text-[13px] leading-relaxed text-[var(--md-on-surface-variant)] break-words" :class="{ 'whitespace-pre-line': pendingShelfDialog.kind === 'notice' }">{{ pendingShelfDialog.message }}</p>
      <template v-if="pendingShelfDialog.kind === 'name'">
        <label for="collection-name" class="block mt-5 text-[11px] text-[var(--md-on-surface-variant)]">书库名称</label>
        <input id="collection-name" ref="nameInput" v-model="name" maxlength="80" autocomplete="off" class="mt-2 w-full min-h-11 rounded-xl px-3 text-[13px] bg-[var(--md-surface-high)] text-[var(--md-on-surface)] border border-[var(--md-outline-variant)]" :aria-invalid="!!error" aria-describedby="collection-name-error" />
        <p id="collection-name-error" v-if="error" role="alert" class="mt-2 text-[13px] text-[var(--md-error)]">{{ error }}</p>
      </template>
      <div v-if="pendingShelfDialog.kind === 'move'" class="mt-4 flex flex-col gap-1">
        <button v-for="option in pendingShelfDialog.options" :key="option.value" type="button" class="md-library-text-button text-left break-words" @click="resolveShelfDialog(option.value)">{{ option.title }}</button>
        <p v-if="!pendingShelfDialog.options.length" class="text-[13px] text-[var(--md-on-surface-variant)]">暂无其他书库，请先新建书库。</p>
      </div>
      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button v-if="pendingShelfDialog.kind === 'notice'" type="button" class="md-library-tonal-button" @click="resolveShelfDialog()">知道了</button>
        <button v-else type="button" class="md-library-text-button" @click="resolveShelfDialog()">取消</button>
        <template v-if="pendingShelfDialog.kind === 'folder'">
          <button type="button" class="md-library-text-button" @click="resolveShelfDialog(false)">直接导入</button>
          <button type="button" class="md-library-tonal-button" @click="resolveShelfDialog(true)">创建书库</button>
        </template>
        <button v-else-if="pendingShelfDialog.kind === 'name'" type="submit" class="md-library-tonal-button">确定</button>
      </div>
    </form>
  </dialog>
</template>

<script setup>
import { ref, shallowRef, watch, nextTick, onBeforeUnmount } from 'vue';
import { useShelfDialogs } from '../composables/useShelfDialogs.js';

const { pendingShelfDialog, resolveShelfDialog } = useShelfDialogs();
const dialogRef = shallowRef(null);
const nameInput = shallowRef(null);
const name = ref('');
const error = ref('');

watch(pendingShelfDialog, async pending => {
  if (!pending) {
    dialogRef.value?.close();
    return;
  }
  name.value = pending.initialName || '';
  error.value = '';
  await nextTick();
  if (!pendingShelfDialog.value) return;
  if (!dialogRef.value.open) dialogRef.value.showModal();
  if (nameInput.value) {
    nameInput.value.focus();
    nameInput.value.select();
  } else dialogRef.value.querySelector('button')?.focus();
});

function submitName() {
  const request = pendingShelfDialog.value;
  if (request.kind !== 'name') return;
  error.value = request.validate?.(name.value) || '';
  if (!name.value.trim()) error.value = '请输入书库名称';
  if (!error.value) resolveShelfDialog(name.value.trim());
}

function onKeydown(event) {
  if (event.key !== 'Tab') return;
  const elements = [...dialogRef.value.querySelectorAll('button, input')];
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onBeforeUnmount(() => resolveShelfDialog());
</script>
