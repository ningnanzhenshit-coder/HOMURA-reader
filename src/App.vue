<template>
  <div class="flex flex-1 min-h-0">
    <SideNav @nav="onRailNav" />

    <div class="flex-1 min-w-0 flex flex-col" :class="isCompact ? 'md-bottom-nav-space' : ''">
      <LibraryHeader
        :count="shelf.library.length"
        v-model:query="query"
        v-model:type="typeFilter"
        v-model:sort="sortKey"
      />

      <main class="flex-1 w-full flex flex-col pb-24">
        <BookShelf v-if="shelf.library.length" :books="visibleBooks" @open="reader.openBook" />
        <EmptyShelf v-else @pick-file="openFilePicker" @pick-folder="openFolderPicker" />
      </main>
    </div>
  </div>

  <!-- 唯一主行动：扩展 FAB「导入」，点开选择导入文件 / 文件夹 -->
  <div class="md-fab-pos flex flex-col items-end">
    <div v-if="importMenuOpen" class="fixed inset-0" @click="importMenuOpen = false"></div>

    <Transition
      enter-active-class="md-sheet-enter-active"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="md-sheet-leave-active"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="importMenuOpen"
        class="absolute right-0 bottom-[68px] w-48 z-10 rounded-2xl bg-[var(--md-surface-container)] shadow-2xl p-1.5 flex flex-col gap-0.5"
        role="menu"
        aria-label="导入作品"
      >
        <button @click="pickFiles" role="menuitem" class="md-mobile-menu-item w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-[var(--md-surface-high)] transition-colors">
          <svg class="w-4 h-4 text-[var(--md-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v11M8 8l4-4 4 4"/></svg>
          导入文件
        </button>
        <button
          v-if="canPickFolder"
          @click="pickFolder"
          role="menuitem"
          class="md-mobile-menu-item w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-[var(--md-surface-high)] transition-colors"
        >
          <svg class="w-4 h-4 text-[var(--md-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          导入文件夹
        </button>
      </div>
    </Transition>

    <button
      @click="importMenuOpen = !importMenuOpen"
      class="relative z-10 h-14 rounded-2xl px-5 inline-flex items-center gap-2.5 bg-[var(--md-primary)] text-[var(--md-on-primary)] text-[13px] font-bold active:scale-95 transition-transform duration-200"
      style="box-shadow: 0 6px 14px -4px color-mix(in srgb, var(--md-primary) 55%, transparent), 0 2px 4px rgba(0,0,0,0.2);"
      title="导入作品"
      aria-haspopup="menu"
      :aria-expanded="importMenuOpen"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.6" d="M12 5v14M5 12h14"/>
      </svg>
      导入
    </button>
  </div>

  <input ref="fileInput" type="file" multiple :accept="fileAccept" class="hidden" @change="onFileChange" />
  <input v-if="canPickFolder" ref="folderInput" type="file" webkitdirectory directory multiple class="hidden" @change="onFileChange" />

  <DragOverlay />
  <ReaderModal />
  <AppToast />

  <!-- Offscreen Measurer for Smart Novel Screen-Fit Pagination -->
  <div ref="measurerRef" id="novelPaginationMeasurer" class="fixed -left-[9999px] top-0 pointer-events-none invisible z-[-1] epub-content font-serif leading-relaxed"></div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useThemeStore } from './stores/theme.js';
import { useShelfStore } from './stores/shelf.js';
import { useReaderStore } from './stores/reader.js';
import { useUiStore } from './stores/ui.js';
import { HomuraStore } from './services/storage.js';
import { fileAccept, canPickFolder, hasFileSystemAccess } from './services/platform.js';
import { resolveBookFormat } from './services/utils.js';
import { installProgressFlushHooks } from './services/progress.js';
import { useImporter } from './composables/useImporter.js';
import { useViewport } from './composables/useViewport.js';
import { showToast } from './composables/useToast.js';
import SideNav from './components/SideNav.vue';
import LibraryHeader from './components/LibraryHeader.vue';
import BookShelf from './components/BookShelf.vue';
import EmptyShelf from './components/EmptyShelf.vue';
import DragOverlay from './components/DragOverlay.vue';
import ReaderModal from './components/ReaderModal.vue';
import AppToast from './components/AppToast.vue';

const theme = useThemeStore();
const shelf = useShelfStore();
const reader = useReaderStore();
const ui = useUiStore();
const importer = useImporter();
const { isCompact } = useViewport();

const measurerRef = ref(null);
const fileInput = ref(null);
const folderInput = ref(null);
const importMenuOpen = ref(false);

// 书架视图状态
const query = ref('');
const typeFilter = ref('all');
const sortKey = ref('recent');
const FORMAT_FILTERS = ['epub', 'markdown', 'mobi', 'pdf'];

const visibleBooks = computed(() => {
  let list = shelf.library;
  // 筛选 chips：类型（漫画 / 轻小说）+ 格式（EPUB / Markdown / MOBI / PDF）
  if (FORMAT_FILTERS.includes(typeFilter.value)) {
    list = list.filter(book => resolveBookFormat(book) === typeFilter.value);
  } else if (typeFilter.value === 'manga') {
    list = list.filter(book => book.type === 'manga' && resolveBookFormat(book) !== 'pdf');
  } else if (typeFilter.value === 'novel') {
    list = list.filter(book => book.type !== 'manga');
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
  if (hasFileSystemAccess) {
    importer.pickFilesViaFSA();
    return;
  }
  fileInput.value && fileInput.value.click();
}

function openFolderPicker() {
  if (!canPickFolder) {
    showToast('当前浏览器不支持文件夹导入，请改用「导入文件」逐个添加');
    return;
  }
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

// FAB 菜单：先收起菜单再走原有导入流程
function pickFiles() {
  importMenuOpen.value = false;
  openFilePicker();
}

function pickFolder() {
  importMenuOpen.value = false;
  openFolderPicker();
}

// Navigation Rail：书架 = 恢复全部 / 最近添加；最近 = 按阅读进度排序
function onRailNav(key) {
  if (key !== 'shelf' && key !== 'recent') return;
  query.value = '';
  typeFilter.value = 'all';
  sortKey.value = key === 'recent' ? 'progress' : 'recent';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 全屏：F 快捷键与阅读器顶栏按钮共用 ui.toggleFullscreen()
// 走 Tauri 原生窗口全屏（Windows 的 WebView2 不接管网页全屏）；浏览器调试环境回退标准 Fullscreen API
// 切换后的窗口焦点由 Rust 端监听窗口事件恢复，见 src-tauri/src/lib.rs
function onFullscreenKeydown(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.toLowerCase() !== 'f') return;
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  e.preventDefault();
  ui.toggleFullscreen();
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
  window.addEventListener('keydown', onFullscreenKeydown);
  // 关窗 / 切后台时兜底刷写进度，防止防抖窗口内的最后一次翻页丢失
  installProgressFlushHooks(reader, shelf);

  // 书架上一次导入的作品会从 IndexedDB 里恢复；第一次使用才放示例书
  await shelf.loadLibrary();

  if (HomuraStore.disabled) {
    showToast('提示：当前环境无法保存书架，请通过本地服务器打开页面');
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onFullscreenKeydown);
});
</script>
