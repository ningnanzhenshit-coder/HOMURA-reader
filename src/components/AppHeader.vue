<template>
  <!-- Top Navigation Bar -->
  <header class="h-16 border-b border-[var(--border-line)] bg-[var(--bg-card)]/95 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-sm">
    <div class="flex items-center gap-3">
      <!-- Red Rounded Square + Golden Book + White ACGN GO Icon -->
      <div class="w-10 h-10 rounded-xl bg-[#E61919] flex items-center justify-center shadow-md shadow-red-500/15 border border-red-600/30 shrink-0">
        <svg class="w-8 h-8" viewBox="0 0 120 115" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(10, 3)">
            <path d="M10 20 C10 18, 16 18, 20 19 L20 62 C26 63, 35 66, 44 71 L44 75 C33 69, 20 66, 10 65 Z" fill="#FFC400"/>
            <path d="M18 14 C18 12, 24 12, 28 13 L28 56 C33 57, 40 60, 46 65 L46 69 C37 63, 26 60, 18 59 Z" fill="#FFC400"/>
            <path d="M29 7 C37 8, 44 13, 48 20 L48 65 C43 58, 36 54, 29 52 Z" fill="#FFC400"/>
            <path d="M84 7 C68 8, 56 13, 51 20 L51 64 C59 56, 71 52, 84 52 L84 40 L76 40 C73 40, 72 36, 75 34 L84 27 Z" fill="#FFC400"/>
            <path d="M51 69 C61 60, 72 57, 83 57 L78 63 C76 66, 79 70, 83 67 L95 54 C97 52, 97 49, 95 47 L83 34 C79 31, 76 35, 78 38 L83 44 C70 44, 59 49, 51 59 Z" fill="#FFC400"/>
          </g>
          <text x="60" y="92" font-family="sans-serif" font-size="17" font-weight="900" fill="#FFFFFF" text-anchor="middle">ACGN</text>
          <text x="60" y="109" font-family="sans-serif" font-size="16" font-weight="900" fill="#FFFFFF" text-anchor="middle">GO</text>
        </svg>
      </div>
      <div class="flex items-center gap-2.5">
        <h1 class="font-display font-extrabold text-lg tracking-tight">HOMURA</h1>
        <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)]">ACGN·GO</span>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <!-- UI Theme Color Swatches (Blue / RedGold / Green / Violet) -->
      <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-line)] mr-1" title="选择 UI 主题颜色">
        <span class="text-[11px] font-semibold text-[var(--fg-muted)] mr-0.5">主题</span>
        <button
          v-for="s in swatches"
          :key="s.name"
          @click="theme.setThemeColor(s.name)"
          :class="['theme-swatch', s.cls, { 'active-swatch': theme.themeColor === s.name }]"
          :title="s.title"
        ></button>
      </div>

      <!-- Surface Mode Switcher: Light / Warm Eye-Care / Dark -->
      <div class="flex items-center bg-[var(--bg-subtle)] p-0.5 rounded-lg border border-[var(--border-line)]">
        <button
          v-for="m in modes"
          :key="m.name"
          @click="theme.setSurfaceMode(m.name)"
          class="px-2 py-1 rounded-md text-xs font-semibold transition"
          :style="modeBtnStyle(m.name)"
          :title="m.title"
        >
          {{ m.label }}
        </button>
      </div>

      <!-- File Open Button -->
      <label class="uiverse-btn-primary" @click="onPickFileClick">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
        <span>导入文件</span>
        <input ref="fileInput" type="file" multiple accept=".epub,.cbz,.zip,.txt,.md,image/*" class="hidden" @change="onFileChange" />
      </label>

      <!-- Folder Open Button -->
      <label class="uiverse-btn" title="导入整个文件夹（支持内含多本EPUB/ZIP或漫画图片子文件夹）" @click="onPickFolderClick">
        <svg class="w-3.5 h-3.5 text-[var(--brand-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
        <span class="hidden sm:inline">导入文件夹</span>
        <input ref="folderInput" type="file" webkitdirectory directory multiple class="hidden" @change="onFileChange" />
      </label>

      <!-- Fullscreen Button (F Key) -->
      <button @click="theme.toggleFullScreen()" class="uiverse-btn font-mono" title="按 F 键切换全屏模式">
        <span>⛶</span>
        <span class="hidden lg:inline">{{ theme.isFullscreen ? '退出 (F)' : 'F 全屏' }}</span>
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue';
import { useThemeStore } from '../stores/theme.js';
import { useImporter } from '../composables/useImporter.js';

const theme = useThemeStore();
const importer = useImporter();

const fileInput = ref(null);
const folderInput = ref(null);

const swatches = [
  { name: 'blue', cls: 'bg-[#2563EB]', title: '晴空蓝 (默认)' },
  { name: 'red', cls: 'bg-[#E61919]', title: '绯红金' },
  { name: 'green', cls: 'bg-[#059669]', title: '森系绿' },
  { name: 'violet', cls: 'bg-[#7C3AED]', title: '星夜紫' }
];

const modes = [
  { name: 'light', label: '☀️ 白昼', title: '纯净白昼模式' },
  { name: 'warm', label: '🌾 护眼', title: '暖色调护眼模式（羊皮纸色 + 柔光滤镜）' },
  { name: 'dark', label: '🌙 夜间', title: '深邃夜间模式' }
];

function modeBtnStyle(name) {
  return theme.surfaceMode === name
    ? { backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }
    : { backgroundColor: 'transparent', color: 'var(--fg-muted)' };
}

async function onPickFileClick(e) {
  // 支持 File System Access 时优先使用句柄，不占 IndexedDB 配额
  if (!window.showOpenFilePicker) return;
  e.preventDefault();
  await importer.pickFilesViaFSA();
}

async function onPickFolderClick(e) {
  if (!window.showDirectoryPicker) return;
  e.preventDefault();
  await importer.pickFolderViaFSA();
}

async function onFileChange(e) {
  await importer.handleFiles(e.target.files);
  e.target.value = '';
}

defineExpose({
  openFilePicker: () => fileInput.value && fileInput.value.click(),
  openFolderPicker: () => folderInput.value && folderInput.value.click()
});
</script>
