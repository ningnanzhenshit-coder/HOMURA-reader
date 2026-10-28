<template>
  <!-- 空书架引导 -->
  <section class="flex-1 flex items-center justify-center py-16">
    <div class="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border-2 border-dashed border-[var(--border-line)] px-8 py-10 flex flex-col items-center text-center gap-4">
      <div class="w-14 h-14 rounded-2xl bg-[#E61919] flex items-center justify-center shadow-md shadow-red-500/15">
        <svg class="w-8 h-8" viewBox="0 0 100 85" fill="none">
          <path d="M10 20 C10 18, 16 18, 20 19 L20 62 C26 63, 35 66, 44 71 L44 75 C33 69, 20 66, 10 65 Z" fill="#FFC400"/>
          <path d="M18 14 C18 12, 24 12, 28 13 L28 56 C33 57, 40 60, 46 65 L46 69 C37 63, 26 60, 18 59 Z" fill="#FFC400"/>
          <path d="M29 7 C37 8, 44 13, 48 20 L48 65 C43 58, 36 54, 29 52 Z" fill="#FFC400"/>
          <path d="M84 7 C68 8, 56 13, 51 20 L51 64 C59 56, 71 52, 84 52 L84 40 L76 40 C73 40, 72 36, 75 34 L84 27 Z" fill="#FFC400"/>
          <path d="M51 69 C61 60, 72 57, 83 57 L78 63 C76 66, 79 70, 83 67 L95 54 C97 52, 97 49, 95 47 L83 34 C79 31, 76 35, 78 38 L83 44 C70 44, 59 49, 51 59 Z" fill="#FFC400"/>
        </svg>
      </div>
      <div class="space-y-1.5">
        <h2 class="text-base font-display font-bold tracking-tight">书架还是空的</h2>
        <p class="text-xs text-[var(--fg-muted)] leading-relaxed">把文件拖进窗口，或直接选择本地文件 / 文件夹</p>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-1.5 font-mono text-[11px]">
        <span class="px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] font-semibold">.EPUB</span>
        <span class="px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] font-semibold">.CBZ / .ZIP</span>
        <span class="px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] font-semibold">.TXT / .MD</span>
        <span class="px-2 py-0.5 rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] font-semibold">图片文件夹</span>
      </div>
      <div class="flex items-center gap-2.5 pt-1">
        <button @click="$emit('pick-file')" class="uiverse-btn-primary">选择文件</button>
        <button @click="$emit('pick-folder')" class="uiverse-btn">选择文件夹</button>
      </div>
    </div>
  </section>
</template>

<script setup>
defineEmits(['pick-file', 'pick-folder']);
</script>
