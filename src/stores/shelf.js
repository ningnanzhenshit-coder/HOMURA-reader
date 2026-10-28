/* ============================================================================
   HOMURA · 书架 Store
   ----------------------------------------------------------------------------
   library / progressMap，增删清空、进度查询、示例书与 IndexedDB 恢复。
   书籍对象内含 zipContent / File 等重对象，library 用 shallowRef 持有，
   书籍内部字段的变更通过替换数组或显式触发来驱动视图更新。
   ========================================================================== */

import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import { HomuraStore } from '../services/storage.js';
import { restoreLibrary, persistBook } from '../services/restore.js';
import { loadProgressMap } from '../services/progress.js';
import { createDemoManga, createDemoNovel } from '../services/demo.js';
import { showToast } from '../composables/useToast.js';

export const useShelfStore = defineStore('shelf', () => {
  const library = shallowRef([]);
  const progressMap = shallowRef({});
  let storageNoticeShown = false;

  function unshiftBook(book) {
    library.value = [book, ...library.value];
  }

  // 新增书籍并落盘；落盘失败只提示一次
  async function addBook(book, source) {
    unshiftBook(book);
    if (!source) return;
    try {
      await persistBook(book, source);
    } catch (err) {
      if (!storageNoticeShown) {
        storageNoticeShown = true;
        showToast('本地存档不可用，请通过 http://localhost 打开页面');
      }
    }
  }

  function removeBook(id) {
    library.value = library.value.filter(b => b.id !== id);
    HomuraStore.deleteBook(id).catch(() => {});
    showToast('已从书架移除该作品');
  }

  function clearShelf() {
    library.value = [];
    HomuraStore.clear().catch(() => {});
    showToast('已清空书架');
  }

  // hydrateBook 会就地改写 book 字段，调用后触发一次浅刷新让卡片更新
  function touchBook(book) {
    const idx = library.value.findIndex(b => b.id === book.id);
    if (idx === -1) return;
    const next = library.value.slice();
    next[idx] = Object.assign({}, book);
    library.value = next;
  }

  function setProgressRecord(record) {
    progressMap.value = Object.assign({}, progressMap.value, { [record.id]: record });
  }

  // 书架展示用：无记录或仍在第一页时不显示，避免满屏「读至 0%」
  function progressInfoFor(bookId) {
    const rec = progressMap.value[bookId];
    if (!rec) return null;
    const ratio = typeof rec.ratio === 'number' ? rec.ratio : 0;
    const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
    if (percent <= 0) return null;
    return { percent, index: rec.index, total: rec.total, updatedAt: rec.updatedAt };
  }

  // 启动初始化：恢复书架 + 进度表；第一次使用时放示例书
  async function loadLibrary() {
    const restored = await restoreLibrary();
    progressMap.value = await loadProgressMap();
    if (restored === null) return false;
    library.value = restored;
    if (restored.length === 0) {
      unshiftBook(createDemoNovel());
      unshiftBook(createDemoManga());
    }
    return restored.length > 0;
  }

  return {
    library,
    progressMap,
    addBook,
    unshiftBook,
    removeBook,
    clearShelf,
    touchBook,
    setProgressRecord,
    progressInfoFor,
    loadLibrary
  };
});
