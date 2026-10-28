<template>
  <div class="flex flex-1 min-h-0">
    <SideNav />

    <div class="flex-1 min-w-0 flex flex-col">
      <LibraryHeader
        :count="shelf.library.length"
        v-model:query="query"
        v-model:type="typeFilter"
        v-model:sort="sortKey"
        @pick-file="openFilePicker"
        @pick-folder="openFolderPicker"
      />

      <main class="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6">
        <ContinueReading @open="reader.openBook" />
        <BookShelf v-if="shelf.library.length" :books="visibleBooks" @open="reader.openBook" />
        <EmptyShelf v-else @pick-file="openFilePicker" @pick-folder="openFolderPicker" />
      </main>
    </div>
  </div>

  <input ref="fileInput" type="file" multiple accept=".epub,.cbz,.zip,.txt,.md,image/*" class="hidden" @change="onFileChange" />
  <input ref="folderInput" type="file" webkitdirectory directory multiple class="hidden" @change="onFileChange" />

  <DragOverlay />
  <ReaderModal />
  <AppToast />

  <!-- Offscreen Measurer for Smart Novel Screen-Fit Pagination -->
  <div ref="measurerRef" id="novelPaginationMeasurer" class="fixed -left-[9999px] top-0 pointer-events-none invisible z-[-1] epub-content font-serif leading-relaxed"></div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useThemeStore } from './stores/theme.js';
import { useShelfStore } from './stores/shelf.js';
import { useReaderStore } from './stores/reader.js';
import { HomuraStore } from './services/storage.js';
import { installProgressFlushHooks } from './services/progress.js';
import { useImporter } from './composables/useImporter.js';
import { showToast } from './composables/useToast.js';
import SideNav from './components/SideNav.vue';
import LibraryHeader from './components/LibraryHeader.vue';
import ContinueReading from './components/ContinueReading.vue';
import BookShelf from './components/BookShelf.vue';
import EmptyShelf from './components/EmptyShelf.vue';
import DragOverlay from './components/DragOverlay.vue';
import ReaderModal from './components/ReaderModal.vue';
import AppToast from './components/AppToast.vue';

const theme = useThemeStore();
const shelf = useShelfStore();
const reader = useReaderStore();
const importer = useImporter();

const measurerRef = ref(null);
const fileInput = ref(null);
const folderInput = ref(null);

// 书架视图状态
const query = ref('');
const typeFilter = ref('all');
const sortKey = ref('recent');

const visibleBooks = computed(() => {
  let list = shelf.library;
  if (typeFilter.value !== 'all') {
    list = list.filter(book => book.type === typeFilter.value);
  }
  const keyword = query.value.trim().toLowerCase();
  if (keyword) {
    list = list.filter(book => (book.title || '').toLowerCase().includes(keyword));
  }
  if (sortKey.value === 'title') {
    return [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN'));
  }
  if (sortKey.value === 'progress') {
    const ts = id => (shelf.progressMap[id] && shelf.progressMap[id].updatedAt) || 0;
    return [...list].sort((a, b) => ts(b.id) - ts(a.id));
  }
  return list;
});

function openFilePicker() {
  if (window.showOpenFilePicker) {
    importer.pickFilesViaFSA();
    return;
  }
  fileInput.value && fileInput.value.click();
}

function openFolderPicker() {
  if (window.showDirectoryPicker) {
    importer.pickFolderViaFSA();
    return;
  }
  folderInput.value && folderInput.value.click();
}

async function onFileChange(e) {
  await importer.handleFiles(e.target.files);
  e.target.value = '';
}

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
