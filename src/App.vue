<template>
  <!-- 手机底栏挂在阅读器预见式返回的 transform 容器外，避免长书架把 fixed 底栏带出视口 -->
  <div id="homura-mobile-nav-root"></div>

  <div
    class="library-back-layer flex flex-1 min-h-0"
    :class="{ 'is-under-reader': !!reader.currentBook }"
  >
    <SideNav v-model:appearance-open="appearanceOpen" @nav="onRailNav" />

    <div class="flex-1 min-w-0 flex flex-col" :class="isCompact ? 'md-bottom-nav-space' : ''">
      <LibraryHeader
        :count="favoritesOnly ? favoriteBooks.length : shelf.library.length"
        :title="favoritesOnly ? '收藏' : '书架'"
        :appearance-open="appearanceOpen"
        @toggle-appearance="appearanceOpen = !appearanceOpen"
        v-model:query="query"
        v-model:type="typeFilter"
        v-model:sort="sortKey"
      />

      <main class="flex-1 w-full flex flex-col pb-40">
        <p v-if="shelf.error || (!reader.currentBook && reader.openError)" role="alert" class="mx-4 min-[900px]:mx-7 mt-3 text-[13px] text-[var(--md-error)]">{{ shelf.error || reader.openError }}</p>
        <BookShelf v-if="favoritesOnly || shelf.library.length || shelf.collections.length" :books="visibleBooks" :favorites-only="favoritesOnly" :sort-key="sortKey" :query="query" :has-filter="!!query.trim() || typeFilter !== 'all'" :home-request="shelfHomeRequest" @open="reader.openBook" @browse="query = ''; typeFilter = 'all'" />
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
        class="absolute right-0 bottom-[136px] w-48 z-10 rounded-2xl bg-[var(--md-surface-container)] shadow-2xl p-1.5 flex flex-col gap-0.5"
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

    <button @click="createCollection" class="relative z-10 mb-3 h-14 px-5 rounded-2xl inline-flex items-center gap-2.5 bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] text-[13px] font-bold active:scale-95 transition-transform duration-200" title="新建书库" aria-label="新建书库">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.6" d="M12 5v14M5 12h14"/></svg>
      新建
    </button>
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
  <div v-if="reader.currentBook" class="reader-back-scrim md-scrim" aria-hidden="true"></div>
  <ReaderModal />
  <DuplicateImportDialog />
  <ShelfDialog />

  <!-- Offscreen Measurer for Smart Novel Screen-Fit Pagination -->
  <div ref="measurerRef" id="novelPaginationMeasurer" class="fixed -left-[9999px] top-0 pointer-events-none invisible z-[-1] epub-content font-sans leading-relaxed"></div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useThemeStore } from './stores/theme.js';
import { useShelfStore } from './stores/shelf.js';
import { useReaderStore } from './stores/reader.js';
import { useUiStore } from './stores/ui.js';
import { fileAccept, canPickFolder, hasFileSystemAccess } from './services/platform.js';
import { resolveBookFormat } from './services/utils.js';
import { sortShelfBooks } from './services/bookTitles.js';
import { bookShelfCategory } from './services/shelfSections.js';
import { installProgressFlushHooks } from './services/progress.js';
import { useImporter } from './composables/useImporter.js';
import { useDuplicateImport } from './composables/useDuplicateImport.js';
import { useShelfDialogs } from './composables/useShelfDialogs.js';
import { collectionNameError, availableCollectionName } from './services/collections.js';
import { useViewport } from './composables/useViewport.js';
import { useAndroidBackExit } from './composables/useAndroidBackExit.js';
import SideNav from './components/SideNav.vue';
import LibraryHeader from './components/LibraryHeader.vue';
import BookShelf from './components/BookShelf.vue';
import EmptyShelf from './components/EmptyShelf.vue';
import DragOverlay from './components/DragOverlay.vue';
import ReaderModal from './components/ReaderModal.vue';
import DuplicateImportDialog from './components/DuplicateImportDialog.vue';
import ShelfDialog from './components/ShelfDialog.vue';

const theme = useThemeStore();
const shelf = useShelfStore();
const reader = useReaderStore();
const ui = useUiStore();
const importer = useImporter();
const { pendingDuplicate, resolveImport } = useDuplicateImport();
const { pendingShelfDialog, askShelfDialog, resolveShelfDialog } = useShelfDialogs();
const { isCompact } = useViewport();

const measurerRef = ref(null);
const fileInput = ref(null);
const folderInput = ref(null);
const importMenuOpen = ref(false);
const appearanceOpen = ref(false);

// 书架视图状态
const query = ref('');
const typeFilter = ref('all');
const sortKey = computed({ get: () => shelf.sortKey, set: value => { shelf.sortKey = value; } });
const shelfHomeRequest = ref(0);
const libraryView = ref('shelf');
const favoritesOnly = computed(() => libraryView.value === 'favorite');
const favoriteBooks = computed(() => shelf.library.filter(book => book.favorite));
const FORMAT_FILTERS = ['epub', 'pdf', 'mobi', 'txt', 'markdown'];
const SPLASH_MIN_DURATION = 720;

useAndroidBackExit(reader, () => {
  if (pendingShelfDialog.value) { resolveShelfDialog(); return true; }
  if (pendingDuplicate.value) {
    resolveImport();
    return true;
  }
  if (importMenuOpen.value) {
    importMenuOpen.value = false;
    return true;
  }
  if (appearanceOpen.value) {
    appearanceOpen.value = false;
    return true;
  }
  if (shelf.activeCollectionId) { shelf.activeCollectionId = null; return true; }
  return false;
});

async function createCollection() {
  importMenuOpen.value = false;
  const title = await askShelfDialog({ kind: 'name', title: '新建书库', initialName: availableCollectionName('新建书库', shelf.collections), validate: name => collectionNameError(name, shelf.collections) });
  if (title === null) return;
  try { await shelf.createCollection(title); } catch (err) { console.warn('[HOMURA] 新建书库失败', err); }
}

const visibleBooks = computed(() => {
  let list = favoritesOnly.value ? favoriteBooks.value : shelf.library;
  // 筛选 chips：类型（漫画 / 轻小说）+ 文件格式
  if (FORMAT_FILTERS.includes(typeFilter.value)) {
    list = list.filter(book => resolveBookFormat(book) === typeFilter.value);
  } else if (['manga', 'novel', 'other'].includes(typeFilter.value)) {
    list = list.filter(book => bookShelfCategory(book) === typeFilter.value);
  }
  const keyword = query.value.trim().toLowerCase();
  if (keyword) {
    list = list.filter(book => (book.title || '').toLowerCase().includes(keyword));
  }
  return sortShelfBooks(list, sortKey.value, shelf.progressMap);
});

function openFilePicker() {
  if (hasFileSystemAccess) {
    importer.pickFilesViaFSA();
    return;
  }
  fileInput.value && fileInput.value.click();
}

function openFolderPicker() {
  if (!canPickFolder) return;
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

// 切换导航时退出书库与多选；收藏平铺展示库内和主页的已收藏书本。
function onRailNav(key) {
  if (!['shelf', 'recent', 'favorite'].includes(key)) return;
  libraryView.value = key;
  shelfHomeRequest.value++;
  shelf.activeCollectionId = null;
  query.value = '';
  typeFilter.value = 'all';
  sortKey.value = key === 'recent' ? 'progress' : 'title';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 全屏：F 快捷键与阅读器顶栏按钮共用 ui.toggleFullscreen()
// 走 Tauri 原生窗口全屏（Windows 的 WebView2 不接管网页全屏）；浏览器调试环境回退标准 Fullscreen API
// 切换后的窗口焦点由 Rust 端监听窗口事件恢复，见 src-tauri/src/lib.rs
function onFullscreenKeydown(e) {
  if (document.querySelector('dialog[open]')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.toLowerCase() !== 'f') return;
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  e.preventDefault();
  ui.toggleFullscreen();
}

async function dismissStartupSplash() {
  const splash = document.getElementById('homura-splash');
  if (!splash) return;

  const startedAt = window.__HOMURA_SPLASH_STARTED_AT__ || performance.now();
  const remaining = Math.max(0, SPLASH_MIN_DURATION - (performance.now() - startedAt));
  if (remaining > 0) {
    await new Promise(resolve => window.setTimeout(resolve, remaining));
  }

  // 等一帧确认书架已经绘到遮罩后面，再开始淡出
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  splash.classList.add('is-leaving');
  splash.setAttribute('aria-hidden', 'true');

  let removed = false;
  const removeSplash = () => {
    if (removed) return;
    removed = true;
    splash.remove();
    document.documentElement.classList.remove('homura-splashing');
  };
  splash.addEventListener('transitionend', event => {
    if (event.target === splash && event.propertyName === 'opacity') removeSplash();
  });
  // prefers-reduced-motion 下没有 transitionend，用定时器兜底
  window.setTimeout(removeSplash, 240);
}

onMounted(async () => {
  let savedTheme = 'blue';
  let savedMode = 'light';
  try {
    savedTheme = localStorage.getItem('homura_theme_color') || 'blue';
    savedMode = localStorage.getItem('homura_surface_mode') || 'light';
  } catch (e) {}

  theme.setThemeColor(savedTheme);
  theme.setSurfaceMode(savedMode, true);

  reader.measurerEl = measurerRef.value;
  window.addEventListener('keydown', onFullscreenKeydown);
  // 关窗 / 切后台时兜底刷写进度，防止防抖窗口内的最后一次翻页丢失
  installProgressFlushHooks(reader, shelf);

  try {
    // 书架上一次导入的作品会从 IndexedDB 里恢复；第一次使用才放示例书
    await shelf.loadLibrary();
  } finally {
    await dismissStartupSplash();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onFullscreenKeydown);
});
</script>
