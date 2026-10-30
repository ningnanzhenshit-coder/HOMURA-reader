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
        <img
          :src="logoUrl"
          alt="HOMURA"
          class="w-12 h-12 shrink-0 select-none pointer-events-none"
          draggable="false"
        />
        <h2 class="text-base font-display font-bold tracking-tight">松手即可加入书架</h2>
        <p class="text-xs text-[var(--fg-muted)]">支持 EPUB / PDF / MOBI / CBZ / ZIP / TXT / MD 以及图片文件夹</p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useImporter } from '../composables/useImporter.js';
import { canDragImport } from '../services/platform.js';
import logoUrl from '../assets/logo.png';

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

// 触屏设备没有可用的拖拽入口，不挂监听，避免拖动页面时误触遮罩
onMounted(() => {
  if (!canDragImport) return;
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
