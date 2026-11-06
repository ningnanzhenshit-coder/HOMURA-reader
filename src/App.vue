<template>
  <!-- 手机底栏挂在阅读器预见式返回的 transform 容器外，避免长书架把 fixed 底栏带出视口 -->
  <div id="homura-mobile-nav-root"></div>

  <div
    class="library-back-layer flex flex-1 min-h-0"
    :class="{ 'is-under-reader': !!reader.currentBook }"
  >
    <SideNav :active="activeNav" @nav="onRailNav" />

    <div
      class="library-main-column flex-1 min-w-0 flex flex-col"
      :class="[
        isCompact && activeNav === 'settings' ? 'is-settings md-bottom-nav-space' : ''
      ]"
      data-app-scroll
    >
      <SettingsView v-if="activeNav === 'settings'" />
      <template v-else>
        <LibraryHeader
          :count="headerCount"
          :title="headerTitle"
          :appearance-open="appearanceOpen"
          :renamable="!!activeCollection"
          :collapsible-search="isAndroidApp && activeNav === 'recent'"
          @toggle-appearance="appearanceOpen = !appearanceOpen"
          @rename="renameActiveCollection"
          v-model:query="query"
          v-model:type="typeFilter"
          v-model:sort="sortKey"
        >
          <template v-if="isCompact" #actions>
            <LibraryImportActions
              compact
              :hide-create="!!activeCollection"
              v-model:open="importMenuOpen"
              @create-collection="createCollection"
              @pick-files="pickFiles"
              @pick-folder="pickFolder"
            />
          </template>
        </LibraryHeader>

        <main
          ref="libraryScrollRef"
          class="library-scroll relative isolate flex-1 w-full flex flex-col min-[900px]:pb-40"
          :class="{ 'md-bottom-nav-space': isCompact }"
          data-app-scroll
        >
          <p v-if="shelf.error || (!reader.currentBook && reader.openError)" role="alert" class="mx-4 min-[900px]:mx-7 mt-3 text-[13px] text-[var(--md-error)]">{{ shelf.error || reader.openError }}</p>
          <BookShelf v-if="favoritesOnly || shelf.library.length || shelf.collections.length || shelf.importingBook || Object.keys(shelf.importingCollections).length" :books="visibleBooks" :favorites-only="favoritesOnly" :sort-key="sortKey" :query="query" :has-filter="!!query.trim() || typeFilter !== 'all'" :home-request="shelfHomeRequest" @open="reader.openBook" @browse="query = ''; typeFilter = 'all'" />
          <EmptyShelf v-else @pick-file="openFilePicker" @pick-folder="openFolderPicker" />
        </main>
      </template>
    </div>
  </div>

  <LibraryImportActions
    v-if="!isCompact && activeNav !== 'settings'"
    :hide-create="!!activeCollection"
    v-model:open="importMenuOpen"
    @create-collection="createCollection"
    @pick-files="pickFiles"
    @pick-folder="pickFolder"
  />

  <input ref="fileInput" type="file" multiple :accept="fileAccept" class="hidden" @change="onFileChange" />
  <input v-if="canPickFolder" ref="folderInput" type="file" webkitdirectory directory multiple class="hidden" @change="onFileChange" />

  <AppearanceSheet v-model:open="appearanceOpen" />
  <DragOverlay />
  <div v-if="reader.currentBook" class="reader-back-scrim md-scrim" aria-hidden="true"></div>
  <ReaderModal />
  <div
    v-if="reader.openingBook"
    role="status"
    class="pointer-events-none fixed left-1/2 top-[calc(4rem+env(safe-area-inset-top))] z-[60] -translate-x-1/2 rounded-full bg-[var(--md-primary-container)] px-4 py-2 text-[13px] font-medium text-[var(--md-on-primary-container)]"
  >正在打开作品…</div>
  <UpdateDialog
    :open="updates.updateDialogOpen"
    :status="updates.updateStatus"
    :release="updates.latestRelease"
    :current-version="updates.appVersion"
    :package-info="updates.updatePackage"
    :error="updates.updateError"
    :download="updates.downloadState"
    :download-error="updates.downloadError"
    @close="updates.closeUpdateDialog"
    @retry="updates.checkForUpdates"
    @changelog="updates.openChangelog"
    @download="updates.startUpdateDownload"
    @cancel-download="updates.cancelCurrentDownload"
    @install="updates.installDownloadedUpdate"
  />
  <ChangelogSheet
    :open="updates.changelogOpen"
    :compact="isCompact"
    :status="updates.changelogStatus"
    :releases="updates.releases"
    :current-version="updates.appVersion"
    :error="updates.changelogError"
    @close="updates.closeChangelog"
    @retry="updates.loadChangelog(true)"
  />
  <DuplicateImportDialog />
  <ShelfDialog />

  <!-- Offscreen Measurer for Smart Novel Screen-Fit Pagination -->
  <div ref="measurerRef" id="novelPaginationMeasurer" class="fixed -left-[9999px] top-0 pointer-events-none invisible z-[-1] epub-content font-sans leading-relaxed"></div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useThemeStore } from './stores/theme.js';
import { useShelfStore } from './stores/shelf.js';
import { useReaderStore } from './stores/reader.js';
import { useUiStore } from './stores/ui.js';
import { useUpdateStore } from './stores/updates.js';
import { fileAccept, canPickFolder, hasFileSystemAccess, isAndroid } from './services/platform.js';
import { canUseNativeStorage } from './services/nativeStorage.js';
import { resolveBookFormat, scrollAppToTop } from './services/utils.js';
import { sortShelfBooks } from './services/bookTitles.js';
import { bookShelfCategory } from './services/shelfSections.js';
import { installProgressFlushHooks } from './services/progress.js';
import { useImporter } from './composables/useImporter.js';
import { useDuplicateImport } from './composables/useDuplicateImport.js';
import { useShelfDialogs } from './composables/useShelfDialogs.js';
import { collectionNameError, availableCollectionName } from './services/collections.js';
import { useViewport } from './composables/useViewport.js';
import { useAndroidBackExit } from './composables/useAndroidBackExit.js';
import { useScrollBounce } from './composables/useScrollBounce.js';
import SideNav from './components/SideNav.vue';
import LibraryHeader from './components/LibraryHeader.vue';
import LibraryImportActions from './components/LibraryImportActions.vue';
import AppearanceSheet from './components/AppearanceSheet.vue';
import BookShelf from './components/BookShelf.vue';
import EmptyShelf from './components/EmptyShelf.vue';
import SettingsView from './components/SettingsView.vue';
import DragOverlay from './components/DragOverlay.vue';
import ReaderModal from './components/ReaderModal.vue';
import UpdateDialog from './components/UpdateDialog.vue';
import ChangelogSheet from './components/ChangelogSheet.vue';
import DuplicateImportDialog from './components/DuplicateImportDialog.vue';
import ShelfDialog from './components/ShelfDialog.vue';

const theme = useThemeStore();
const shelf = useShelfStore();
const reader = useReaderStore();
const ui = useUiStore();
const updates = useUpdateStore();
const importer = useImporter();
const { pendingDuplicate, resolveImport } = useDuplicateImport();
const { pendingShelfDialog, askShelfDialog, resolveShelfDialog } = useShelfDialogs();
const { isCompact } = useViewport();

const measurerRef = ref(null);
const libraryScrollRef = shallowRef(null);
const fileInput = ref(null);
const folderInput = ref(null);
const importMenuOpen = ref(false);
const appearanceOpen = ref(false);
const activeNav = ref('shelf');
const isAndroidApp = canUseNativeStorage();

useScrollBounce(libraryScrollRef);

// 书架视图状态
const query = ref('');
const typeFilter = ref('all');
const sortKey = computed({ get: () => shelf.sortKey, set: value => { shelf.sortKey = value; } });
const shelfHomeRequest = ref(0);
const libraryView = ref('shelf');
const favoritesOnly = computed(() => libraryView.value === 'favorite');
const favoriteBooks = computed(() => shelf.library.filter(book => book.favorite));
const activeCollection = computed(() => activeNav.value === 'shelf' ? shelf.collections.find(item => item.id === shelf.activeCollectionId) || null : null);
watch(() => shelf.activeCollectionId, () => {
  if (!isAndroid) scrollAppToTop();
});
const activeCollectionBookCount = computed(() => {
  const ids = new Set(activeCollection.value?.bookIds || []);
  return shelf.library.filter(book => ids.has(book.id)).length;
});
const headerTitle = computed(() => {
  if (activeNav.value === 'favorite') return '收藏';
  if (activeNav.value === 'recent') return '最近';
  return activeCollection.value?.title || '书架';
});
const headerCount = computed(() => activeCollection.value ? activeCollectionBookCount.value : favoritesOnly.value ? favoriteBooks.value.length : shelf.library.length);
const FORMAT_FILTERS = ['epub', 'pdf', 'mobi', 'txt', 'markdown'];
const SPLASH_MIN_DURATION = 720;
let previousUpdateBodyOverflow = '';
let updateBodyLocked = false;

useAndroidBackExit(reader, () => {
  if (pendingShelfDialog.value) { resolveShelfDialog(); return true; }
  if (pendingDuplicate.value) {
    resolveImport();
    return true;
  }
  if (activeNav.value === 'settings') {
    activeNav.value = 'shelf';
    scrollAppToTop('smooth');
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

watch(
  () => updates.overlayOpen,
  open => {
    if (open && !updateBodyLocked) {
      previousUpdateBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      updateBodyLocked = true;
      return;
    }
    if (!open && updateBodyLocked) {
      document.body.style.overflow = previousUpdateBodyOverflow;
      updateBodyLocked = false;
    }
  }
);

watch(isCompact, () => { importMenuOpen.value = false; });

// 进入阅读器时收起外观浮层，避免它悬在阅读舞台之上
watch(() => reader.currentBook, book => {
  if (book) appearanceOpen.value = false;
});

async function createCollection() {
  importMenuOpen.value = false;
  const title = await askShelfDialog({ kind: 'name', title: '新建书库', initialName: availableCollectionName('新建书库', shelf.collections), validate: name => collectionNameError(name, shelf.collections) });
  if (title === null) return;
  try { await shelf.createCollection(title); } catch (err) { console.warn('[HOMURA] 新建书库失败', err); }
}

async function renameActiveCollection() {
  const item = activeCollection.value;
  if (!item) return;
  const title = await askShelfDialog({
    kind: 'name',
    title: '重命名书库',
    initialName: item.title,
    validate: name => collectionNameError(name, shelf.collections, item.id)
  });
  if (title === null) return;
  try {
    await shelf.renameCollection(item.id, title);
  } catch (err) {
    shelf.error = err.message || '重命名书库失败，请重试';
    console.warn('[HOMURA] 重命名书库失败', err);
  }
}

const visibleBooks = computed(() => {
  let list = favoritesOnly.value ? favoriteBooks.value : shelf.library;
  const preview = shelf.importingBook?.book;
  if (!favoritesOnly.value && preview && !list.some(book => book.id === preview.id)) list = [preview, ...list];
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
    importer.pickFilesViaFSA({ offerCollection: isCompact.value });
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
  try {
    await importer.handleFiles(e.target.files, { offerCollection: isCompact.value });
  } finally {
    e.target.value = '';
  }
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

// 设置是一级页面；书架 / 最近 / 收藏复用书库筛选状态。
function onRailNav(key) {
  if (!['shelf', 'recent', 'favorite', 'settings'].includes(key)) return;
  importMenuOpen.value = false;
  appearanceOpen.value = false;
  activeNav.value = key;
  if (key === 'settings') {
    scrollAppToTop('smooth');
    return;
  }
  libraryView.value = key;
  shelfHomeRequest.value++;
  shelf.activeCollectionId = null;
  query.value = '';
  typeFilter.value = 'all';
  if (key === 'recent') sortKey.value = 'progress';
  else sortKey.value = 'title';
  scrollAppToTop(isAndroid ? 'smooth' : 'auto');
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
  let savedTheme = 'orchid';
  let savedMode = 'light';
  try {
    savedTheme = localStorage.getItem('homura_theme_color') || 'orchid';
    savedMode = localStorage.getItem('homura_surface_mode') || 'light';
  } catch (e) {}

  theme.setThemeColor(savedTheme);
  theme.setSurfaceMode(savedMode, true);

  reader.measurerEl = measurerRef.value;
  window.addEventListener('keydown', onFullscreenKeydown);
  // 关窗 / 切后台时兜底刷写进度，防止防抖窗口内的最后一次翻页丢失
  installProgressFlushHooks(reader, shelf);
  updates.checkForUpdates({ startup: true });

  try {
    // 书架上一次导入的作品会从 IndexedDB 里恢复；第一次使用才放示例书
    await shelf.loadLibrary();
  } finally {
    await dismissStartupSplash();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onFullscreenKeydown);
  if (updateBodyLocked) document.body.style.overflow = previousUpdateBodyOverflow;
});
</script>
