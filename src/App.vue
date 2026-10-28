<template>
  <AppHeader ref="headerRef" />

  <!-- Main Workspace -->
  <main class="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 flex flex-col gap-8">
    <DropZone @pick-file="headerRef && headerRef.openFilePicker()" @pick-folder="headerRef && headerRef.openFolderPicker()" />
    <BookShelf @open="reader.openBook" />
  </main>

  <ReaderModal />
  <AppToast />

  <!-- Offscreen Measurer for Smart Novel Screen-Fit Pagination -->
  <div ref="measurerRef" id="novelPaginationMeasurer" class="fixed -left-[9999px] top-0 pointer-events-none invisible z-[-1] epub-content font-serif leading-relaxed"></div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useThemeStore } from './stores/theme.js';
import { useShelfStore } from './stores/shelf.js';
import { useReaderStore } from './stores/reader.js';
import { HomuraStore } from './services/storage.js';
import { installProgressFlushHooks } from './services/progress.js';
import { showToast } from './composables/useToast.js';
import AppHeader from './components/AppHeader.vue';
import DropZone from './components/DropZone.vue';
import BookShelf from './components/BookShelf.vue';
import ReaderModal from './components/ReaderModal.vue';
import AppToast from './components/AppToast.vue';

const theme = useThemeStore();
const shelf = useShelfStore();
const reader = useReaderStore();

const headerRef = ref(null);
const measurerRef = ref(null);

onMounted(async () => {
  let savedTheme = 'blue';
  let savedMode = 'light';
  try {
    savedTheme = localStorage.getItem('homura_theme_color') || 'blue';
    savedMode = localStorage.getItem('homura_surface_mode') || 'light';
  } catch (e) {}

  theme.setThemeColor(savedTheme, true);
  theme.setSurfaceMode(savedMode, true);

  reader.measurerEl = measurerRef.value;
  // 关窗 / 切后台时兜底刷写进度，防止防抖窗口内的最后一次翻页丢失
  installProgressFlushHooks(reader, shelf);

  // 书架上一次导入的作品会从 IndexedDB 里恢复；第一次使用才放示例书
  await shelf.loadLibrary();

  if (HomuraStore.disabled) {
    showToast('提示：当前环境无法保存书架，请通过本地服务器打开页面');
  }
});
</script>
