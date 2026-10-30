<template>
  <!-- 空书架引导 -->
  <section class="flex-1 flex items-center justify-center py-16">
    <div class="w-full max-w-md rounded-[16px] bg-[var(--md-surface-container)] border border-dashed border-[var(--md-outline-variant)] px-5 sm:px-8 py-8 sm:py-10 flex flex-col items-center text-center gap-4">
      <img
        :src="logoUrl"
        alt="HOMURA"
        class="w-14 h-14 shrink-0 select-none pointer-events-none"
        draggable="false"
      />
      <div class="space-y-1.5">
        <h2 class="text-base font-display font-bold tracking-tight">书架还是空的</h2>
        <p class="text-xs text-[var(--md-on-surface-variant)] leading-relaxed">{{ isPhone ? '选择本地文件或文件夹导入作品' : '把文件拖进窗口，或直接选择本地文件 / 文件夹' }}</p>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-1.5 font-mono text-[11px]">
        <span class="px-2 py-0.5 rounded-md bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border border-[var(--md-outline-variant)] font-semibold">.EPUB</span>
        <span class="px-2 py-0.5 rounded-md bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border border-[var(--md-outline-variant)] font-semibold">.CBZ / .ZIP</span>
        <span class="px-2 py-0.5 rounded-md bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border border-[var(--md-outline-variant)] font-semibold">.TXT / .MD</span>
        <span class="px-2 py-0.5 rounded-md bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border border-[var(--md-outline-variant)] font-semibold">.MOBI</span>
        <span class="px-2 py-0.5 rounded-md bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] border border-[var(--md-outline-variant)] font-semibold">图片文件夹</span>
      </div>
      <div class="flex items-center gap-2.5 pt-1">
        <button @click="$emit('pick-file')" class="uiverse-btn-primary">选择文件</button>
        <button @click="$emit('pick-folder')" class="uiverse-btn">选择文件夹</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import logoUrl from '../assets/logo.png';
import { useViewport } from '../composables/useViewport.js';

const { isPhone } = useViewport();

defineEmits(['pick-file', 'pick-folder']);
</script>
