/* ============================================================================
   HOMURA · 书架 Store
   ----------------------------------------------------------------------------
   library / progressMap，增删清空、进度查询、示例书与 IndexedDB 恢复。
   书籍对象内含 zipContent / File 等重对象，library 用 shallowRef 持有，
   书籍内部字段的变更通过替换数组或显式触发来驱动视图更新。
   ========================================================================== */

import { defineStore } from 'pinia';
import { shallowRef, ref } from 'vue';
import { collectionNameError, moveCollectionBooks, restoreCollections } from '../services/collections.js';
import { sortShelfBooks } from '../services/bookTitles.js';
import { HomuraStore } from '../services/storage.js';
import { restoreLibrary, persistBook } from '../services/restore.js';
import { loadProgressMap } from '../services/progress.js';
import { createDemoManga, createDemoNovel } from '../services/demo.js';
import { prepareBookCover } from '../services/bookCover.js';

export const useShelfStore = defineStore('shelf', () => {
  const library = shallowRef([]);
  const progressMap = shallowRef({});
  const collections = shallowRef([]);
  const activeCollectionId = ref(null);
  const sortKey = ref('title');
  const error = ref('');
  let collectionQueue = Promise.resolve();
  let favoriteQueue = Promise.resolve();

  function booksInCollection(id) {
    const collection = collections.value.find(item => item.id === id);
    if (!collection) return [];
    const ids = new Set(collection.bookIds);
    return sortShelfBooks(library.value.filter(book => ids.has(book.id)), sortKey.value, progressMap.value);
  }

  function updateCollections(change) {
    const task = collectionQueue.then(async () => {
      const next = change(collections.value);
      await HomuraStore.saveCollections(next);
      collections.value = next;
      error.value = '';
    });
    collectionQueue = task.catch(err => {
      error.value = err.message || '书库保存失败，请重试';
      console.warn('[HOMURA] 书库保存失败', err);
    });
    return task;
  }

  async function createCollection(title) {
    const item = { id: `collection_${crypto.randomUUID()}`, title: title.trim(), createdAt: Date.now(), bookIds: [] };
    await updateCollections(current => {
      const message = collectionNameError(title, current);
      if (message) throw new Error(message);
      return [...current, item];
    });
    return item;
  }

  function renameCollection(id, title) {
    return updateCollections(current => {
      const message = collectionNameError(title, current, id);
      if (message) throw new Error(message);
      return current.map(item => item.id === id ? { ...item, title: title.trim() } : item);
    });
  }

  async function deleteCollection(id) {
    await updateCollections(current => current.filter(item => item.id !== id));
    if (activeCollectionId.value === id) activeCollectionId.value = null;
  }

  function moveBooks(ids, targetId = null) {
    const existing = new Set(library.value.map(book => book.id));
    return updateCollections(current => moveCollectionBooks(current, ids.filter(id => existing.has(id)), targetId));
  }

  function unshiftBook(book) {
    library.value = [book, ...library.value];
  }

  // 新增书籍并落盘；写入失败由导入层汇总记录
  async function addBook(book, source) {
    unshiftBook(book);
    if (!source) throw new Error('缺少原文件来源');
    try {
      return await persistBook(book, source);
    } catch (err) {
      console.error('[HOMURA] 本地存档写入失败', err);
      throw err;
    }
  }

  function removeBook(id) {
    library.value = library.value.filter(b => b.id !== id);
    HomuraStore.deleteBook(id).catch(() => {});
    updateCollections(current => moveCollectionBooks(current, [id], null)).catch(() => {});
  }

  async function clearShelf() {
    library.value = [];
    progressMap.value = {};
    activeCollectionId.value = null;
    collections.value = [];
    collectionQueue = collectionQueue.then(async () => {
      await HomuraStore.clear();
      collections.value = [];
      activeCollectionId.value = null;
    }).catch(err => console.warn('[HOMURA] 清空书架失败', err));
    await collectionQueue;
  }

  async function clearProgress() {
    progressMap.value = {};
    try {
      await HomuraStore.clearProgress();
    } catch (err) {
      console.error('[HOMURA] 清空阅读进度失败', err);
    }
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

  async function setBookCover(id, file) {
    let book = library.value.find(item => item.id === id);
    if (!book) throw new Error('书本已从书架移除');
    const blob = file ? await prepareBookCover(file) : null;
    // 示例内容没有原始文件存档，封面随本次示例一起保留在内存中。
    if (!id.startsWith('demo_')) await HomuraStore.updateBookCover(id, blob);
    book = library.value.find(item => item.id === id);
    if (!book) return null;
    if (!book.customCoverBlob) book.originalCover = book.cover;
    const previous = book.cover;
    book.customCoverBlob = blob;
    book.cover = blob ? URL.createObjectURL(blob) : (book.originalCover || (book.coverBlob ? URL.createObjectURL(book.coverBlob) : null));
    if (previous?.startsWith('blob:') && previous !== book.originalCover && previous !== book.cover) URL.revokeObjectURL(previous);
    touchBook(book);
    return book;
  }

  function updateFavorite(id, change) {
    const task = favoriteQueue.then(async () => {
      const book = library.value.find(item => item.id === id);
      if (!book) throw new Error('书本已从书架移除');
      const favorite = change(!!book.favorite);
      if (favorite === !!book.favorite) return favorite;
      if (!id.startsWith('demo_')) await HomuraStore.updateBookFavorite(id, favorite);
      library.value = library.value.map(item => item.id === id ? { ...item, favorite } : item);
      return favorite;
    });
    favoriteQueue = task.catch(() => {});
    return task;
  }

  function toggleFavorite(id) { return updateFavorite(id, favorite => !favorite); }
  function setFavorite(id, favorite) { return updateFavorite(id, () => !!favorite); }

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
    collections.value = restoreCollections(await HomuraStore.listCollections(), restored);
    if (restored.length === 0 && collections.value.length === 0) {
      unshiftBook(createDemoNovel());
      unshiftBook(createDemoManga());
    }
    return restored.length > 0;
  }

  return {
    library,
    progressMap,
    collections,
    activeCollectionId,
    sortKey,
    booksInCollection,
    error,
    createCollection,
    renameCollection,
    deleteCollection,
    moveBooks,
    addBook,
    unshiftBook,
    removeBook,
    clearShelf,
    clearProgress,
    touchBook,
    setBookCover,
    toggleFavorite,
    setFavorite,
    setProgressRecord,
    progressInfoFor,
    loadLibrary
  };
});
