<template>
  <!-- Minimalist Drop Dock -->
  <section
    class="rounded-2xl bg-[var(--bg-card)] border-2 border-dashed border-[var(--border-line)] hover:border-[var(--brand-primary)] px-6 py-7 transition-all duration-200 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-sm"
    :class="{ '!border-[var(--brand-primary)]': isDragActive }"
  >
    <div class="flex items-center gap-4">
      <div class="w-12 h-12 rounded-2xl bg-[#E61919] flex items-center justify-center shrink-0 shadow-md shadow-red-500/15">
        <svg class="w-7 h-7" viewBox="0 0 100 85" fill="none">
          <path d="M10 20 C10 18, 16 18, 20 19 L20 62 C26 63, 35 66, 44 71 L44 75 C33 69, 20 66, 10 65 Z" fill="#FFC400"/>
          <path d="M18 14 C18 12, 24 12, 28 13 L28 56 C33 57, 40 60, 46 65 L46 69 C37 63, 26 60, 18 59 Z" fill="#FFC400"/>
          <path d="M29 7 C37 8, 44 13, 48 20 L48 65 C43 58, 36 54, 29 52 Z" fill="#FFC400"/>
          <path d="M84 7 C68 8, 56 13, 51 20 L51 64 C59 56, 71 52, 84 52 L84 40 L76 40 C73 40, 72 36, 75 34 L84 27 Z" fill="#FFC400"/>
          <path d="M51 69 C61 60, 72 57, 83 57 L78 63 C76 66, 79 70, 83 67 L95 54 C97 52, 97 49, 95 47 L83 34 C79 31, 76 35, 78 38 L83 44 C70 44, 59 49, 51 59 Z" fill="#FFC400"/>
        </svg>
      </div>
      <div class="space-y-2 text-center sm:text-left">
        <h2 class="text-base font-display font-bold tracking-tight">
          拖入本地文件或文件夹，直接加入书架
        </h2>
        <div class="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 font-mono text-[11px]">
          <span class="px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] font-semibold">.EPUB / .KEPUB</span>
          <span class="px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] font-semibold">.CBZ / .ZIP</span>
          <span class="px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] font-semibold">.TXT / .MD</span>
          <span class="px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] font-semibold">图片文件夹</span>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2.5 shrink-0">
      <button @click="$emit('pick-file')" class="uiverse-btn-primary">
        选择文件
      </button>
      <button @click="$emit('pick-folder')" class="uiverse-btn">
        选择文件夹
      </button>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useImporter } from '../composables/useImporter.js';

defineEmits(['pick-file', 'pick-folder']);

const importer = useImporter();
const isDragActive = ref(false);

function onDragOver(e) {
  e.preventDefault();
  isDragActive.value = true;
}

function onDragLeave(e) {
  e.preventDefault();
  isDragActive.value = false;
}

async function onDrop(e) {
  e.preventDefault();
  isDragActive.value = false;
  await importer.handleDrop(e);
}

onMounted(() => {
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
});

onUnmounted(() => {
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('drop', onDrop);
});
</script>
