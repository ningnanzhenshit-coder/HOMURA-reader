<template>
  <!-- 全窗拖拽遮罩：拖入文件时淡入，松手即导入 -->
  <transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="active" class="fixed inset-0 z-[60] pointer-events-none bg-[var(--bg-canvas)] flex items-center justify-center p-8">
      <div class="w-full max-w-lg rounded-2xl border-2 border-dashed border-[var(--brand-primary)] bg-[var(--bg-card)] px-8 py-10 flex flex-col items-center text-center gap-3 shadow-xl">
        <div class="w-12 h-12 rounded-2xl bg-[#E61919] flex items-center justify-center shadow-md shadow-red-500/15">
          <svg class="w-7 h-7" viewBox="0 0 100 85" fill="none">
            <path d="M10 20 C10 18, 16 18, 20 19 L20 62 C26 63, 35 66, 44 71 L44 75 C33 69, 20 66, 10 65 Z" fill="#FFC400"/>
            <path d="M18 14 C18 12, 24 12, 28 13 L28 56 C33 57, 40 60, 46 65 L46 69 C37 63, 26 60, 18 59 Z" fill="#FFC400"/>
            <path d="M29 7 C37 8, 44 13, 48 20 L48 65 C43 58, 36 54, 29 52 Z" fill="#FFC400"/>
            <path d="M84 7 C68 8, 56 13, 51 20 L51 64 C59 56, 71 52, 84 52 L84 40 L76 40 C73 40, 72 36, 75 34 L84 27 Z" fill="#FFC400"/>
            <path d="M51 69 C61 60, 72 57, 83 57 L78 63 C76 66, 79 70, 83 67 L95 54 C97 52, 97 49, 95 47 L83 34 C79 31, 76 35, 78 38 L83 44 C70 44, 59 49, 51 59 Z" fill="#FFC400"/>
          </svg>
        </div>
        <h2 class="text-base font-display font-bold tracking-tight">松手即可加入书架</h2>
        <p class="text-xs text-[var(--fg-muted)]">支持 EPUB / CBZ / ZIP / TXT / MD 以及图片文件夹</p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useImporter } from '../composables/useImporter.js';

const importer = useImporter();
const active = ref(false);
let dragDepth = 0;

function isFileDrag(e) {
  return !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
}

function onDragEnter(e) {
  if (!isFileDrag(e)) return;
  dragDepth++;
  active.value = true;
}

function onDragOver(e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  if (!active.value) active.value = true;
}

function onDragLeave(e) {
  if (!isFileDrag(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) active.value = false;
}

async function onDrop(e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0;
  active.value = false;
  await importer.handleDrop(e);
}

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
});

onUnmounted(() => {
  window.removeEventListener('dragenter', onDragEnter);
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('drop', onDrop);
});
</script>
