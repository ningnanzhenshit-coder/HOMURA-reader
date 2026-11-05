/* ============================================================================
   HOMURA 书架本地存档
   ----------------------------------------------------------------------------
   IndexedDB 始终保存完整书目、原始文件来源、封面与进度，是数据存在性的最终
   依据；Tauri 环境额外把书目、书库、封面缩略图与进度镜像到 SQLite。

   books    : 书架元数据（标题 / 类型 / 页数 / 封面 Blob）
   sources  : 原始文件。桌面端优先存 FileSystemFileHandle（不占浏览器配额）；
              Android 存原生 AppData 相对路径，其余平台存 OPFS 或 IndexedDB Blob。
   progress : 每本书的阅读进度（页码索引 / 总页数 / 比例）

   原生写入前会落下 dirty 标记，成功后清除；若进程在两次写入之间退出，下次
   启动会从 IndexedDB 完整重建 SQLite，避免半截镜像把已删除的书复活。
   浏览器禁用 IndexedDB（例如直接 file:// 打开）时自动降级为纯内存模式。
   ========================================================================== */

import { removeBookDir, clearAll } from './opfs.js';
import { clearNativeSources, removeNativeBookDir } from './nativeStorage.js';
import { disableNativeFeature } from './nativeRuntime.js';
import {
  canUseNativeMetadata,
  clearNativeMetadata,
  clearNativeProgress,
  deleteNativeBook,
  loadNativeMetadata,
  replaceNativeMetadata,
  saveNativeCollections,
  saveNativeProgress,
  upsertNativeBook
} from './nativeMetadata.js';

export const HomuraStore = (() => {
  const DB_NAME = 'homura_shelf';
  const DB_VERSION = 3;
  const STORE_BOOKS = 'books';
  const STORE_SOURCES = 'sources';
  const STORE_PROGRESS = 'progress';
  const STORE_COLLECTIONS = 'collections';
  const NATIVE_DIRTY_KEY = 'homura-native-metadata-dirty';
  let dbPromise = null;
  let disabled = false;
  let nativeSnapshot = null;
  let nativeSnapshotPromise = null;
  let nativeWriteQueue = Promise.resolve();
  let pendingNativeWrites = 0;
  let nativeDirtyMemory = false;
  let nativeMirrorFailed = false;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB 不可用'));
        return;
      }
      let blockedWarned = false;
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_BOOKS)) db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_SOURCES)) db.createObjectStore(STORE_SOURCES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_PROGRESS)) db.createObjectStore(STORE_PROGRESS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_COLLECTIONS)) db.createObjectStore(STORE_COLLECTIONS, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          dbPromise = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
      req.onblocked = () => {
        if (blockedWarned) return;
        blockedWarned = true;
        console.warn('[HomuraStore] IndexedDB 升级被其它标签页占用，等待旧连接关闭');
      };
    }).catch(err => {
      disabled = true;
      console.warn('[HomuraStore] ' + err.message);
      throw err;
    });
    return dbPromise;
  }

  function run(storeName, mode, action) {
    if (disabled) return Promise.resolve(undefined);
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = action(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  // 书籍元数据与源文件在同一次事务里写入，保证不会出现「有书没源」的孤儿记录
  function idbSaveBook(meta, source) {
    if (disabled) return Promise.reject(new Error('IndexedDB 不可用'));
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_BOOKS, STORE_SOURCES], 'readwrite');
      tx.objectStore(STORE_BOOKS).put(meta);
      tx.objectStore(STORE_SOURCES).put(source);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function idbListBooks() {
    return run(STORE_BOOKS, 'readonly', store => store.getAll()).then(list => list || []);
  }

  function idbGetBook(id) {
    return run(STORE_BOOKS, 'readonly', store => store.get(id));
  }

  function idbUpdateBookCover(id, customCoverBlob) {
    if (disabled) return Promise.reject(new Error('本地存储不可用，封面未保存'));
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKS);
      let found = false;
      const req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) return;
        found = true;
        store.put({ ...req.result, customCoverBlob });
      };
      tx.oncomplete = () => found ? resolve() : reject(new Error('书本尚未保存，请稍后重试'));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  // 只更新解析后可能变化的元数据，保留加入时间、收藏与自定义封面。
  function idbUpdateBookMeta(id, patch) {
    if (disabled) return Promise.reject(new Error('本地存储不可用，书本信息未保存'));
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKS);
      let found = false;
      const req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) return;
        found = true;
        store.put({ ...req.result, ...patch });
      };
      tx.oncomplete = () => found ? resolve() : reject(new Error('书本尚未保存，请稍后重试'));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function idbGetSource(id) {
    return run(STORE_SOURCES, 'readonly', store => store.get(id));
  }

  function idbUpdateBookFavorite(id, favorite) {
    if (disabled) return Promise.reject(new Error('本地存储不可用，收藏未保存'));
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKS);
      let found = false;
      const req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) return;
        found = true;
        store.put({ ...req.result, favorite: !!favorite });
      };
      tx.oncomplete = () => found ? resolve() : reject(new Error('书本尚未保存，请稍后重试'));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function idbListCollections() {
    return run(STORE_COLLECTIONS, 'readonly', store => store.getAll()).then(list => list || []);
  }

  // 整批写入归属，移动多个书本时不会留下同时属于两个书库的中间状态。
  function idbSaveCollections(collections) {
    if (disabled) return Promise.reject(new Error('IndexedDB 不可用，书库无法保存'));
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_COLLECTIONS, 'readwrite');
      const store = tx.objectStore(STORE_COLLECTIONS);
      store.clear();
      collections.forEach(item => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function idbSaveProgress(record) {
    return run(STORE_PROGRESS, 'readwrite', store => store.put(record));
  }

  function idbGetProgress(id) {
    return run(STORE_PROGRESS, 'readonly', store => store.get(id));
  }

  function idbListProgress() {
    return run(STORE_PROGRESS, 'readonly', store => store.getAll()).then(list => list || []);
  }

  function idbClearProgress() {
    return run(STORE_PROGRESS, 'readwrite', store => store.clear());
  }

  function setNativeDirtyMarker() {
    nativeDirtyMemory = true;
    try {
      localStorage.setItem(NATIVE_DIRTY_KEY, '1');
    } catch (err) {}
  }

  function clearNativeDirtyMarker() {
    nativeDirtyMemory = false;
    try {
      localStorage.removeItem(NATIVE_DIRTY_KEY);
    } catch (err) {}
  }

  function hasNativeDirtyMarker() {
    if (nativeDirtyMemory) return true;
    try {
      return localStorage.getItem(NATIVE_DIRTY_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function markNativeDirty() {
    if (canUseNativeMetadata()) setNativeDirtyMarker();
  }

  function disableBrokenNativeMetadata(error) {
    console.warn('[HomuraStore] 原生元数据不可用，回退 IndexedDB', error);
    nativeMirrorFailed = true;
    disableNativeFeature('metadata', error?.message || 'SQLite 元数据后端失败');
    nativeSnapshot = null;
  }

  // 原生镜像写入串行执行，等最后一项落盘后才清除 dirty 标记。
  // 任一项失败会保留标记，下次启动从 IndexedDB 重建 SQLite。
  function queueNativeMirror(task) {
    if (!canUseNativeMetadata()) return Promise.resolve(false);
    pendingNativeWrites++;
    setNativeDirtyMarker();
    const runTask = nativeWriteQueue.then(task);
    nativeWriteQueue = runTask.catch(() => {});
    return runTask.then(
      () => {
        pendingNativeWrites--;
        if (pendingNativeWrites === 0 && !nativeMirrorFailed) clearNativeDirtyMarker();
        return true;
      },
      error => {
        pendingNativeWrites--;
        disableBrokenNativeMetadata(error);
        return false;
      }
    );
  }

  function upsertCachedBook(meta) {
    if (!nativeSnapshot) return;
    const books = nativeSnapshot.books.filter(book => book.id !== meta.id);
    books.push(meta);
    books.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    nativeSnapshot = { ...nativeSnapshot, books };
  }

  function removeCachedBook(id) {
    if (!nativeSnapshot) return;
    nativeSnapshot = {
      ...nativeSnapshot,
      books: nativeSnapshot.books.filter(book => book.id !== id),
      progress: nativeSnapshot.progress.filter(record => record.id !== id)
    };
  }

  function replaceCachedCollections(collections) {
    if (nativeSnapshot) nativeSnapshot = { ...nativeSnapshot, collections };
  }

  function upsertCachedProgress(record) {
    if (!nativeSnapshot) return;
    nativeSnapshot = {
      ...nativeSnapshot,
      progress: nativeSnapshot.progress.filter(item => item.id !== record.id).concat(record)
    };
  }

  function clearCachedProgress() {
    if (nativeSnapshot) nativeSnapshot = { ...nativeSnapshot, progress: [] };
  }

  async function readIndexedDbSnapshot() {
    return {
      books: await idbListBooks(),
      collections: await idbListCollections(),
      progress: await idbListProgress()
    };
  }

  async function loadNativeOrMigrate() {
    try {
      const loaded = await loadNativeMetadata();
      if (loaded.initialized) {
        nativeSnapshot = loaded;
        return nativeSnapshot;
      }
    } catch (err) {
      disableBrokenNativeMetadata(err);
      return null;
    }

    // 首次启用 SQLite，或上次镜像中途失败：IndexedDB 是唯一完整快照。
    const fallback = await readIndexedDbSnapshot();
    nativeSnapshot = fallback;
    await queueNativeMirror(() => replaceNativeMetadata(fallback));
    return nativeSnapshot;
  }

  async function getNativeSnapshot() {
    if (!canUseNativeMetadata()) return null;
    if (nativeSnapshot) return nativeSnapshot;
    if (!nativeSnapshotPromise) {
      nativeSnapshotPromise = (hasNativeDirtyMarker()
        ? (async () => {
          const fallback = await readIndexedDbSnapshot();
          nativeSnapshot = fallback;
          await queueNativeMirror(() => replaceNativeMetadata(fallback));
          return nativeSnapshot;
        })()
        : loadNativeOrMigrate()
      ).finally(() => {
        nativeSnapshotPromise = null;
      });
    }
    return nativeSnapshotPromise;
  }

  async function readMetadataList(key, fallback) {
    const snapshot = await getNativeSnapshot();
    return snapshot ? snapshot[key] || [] : fallback();
  }

  async function mirrorBook(meta) {
    if (!canUseNativeMetadata()) return;
    const written = await queueNativeMirror(() => upsertNativeBook(meta));
    if (written) upsertCachedBook(meta);
  }

  async function saveBook(meta, source) {
    markNativeDirty();
    await idbSaveBook(meta, source);
    upsertCachedBook(meta);
    await mirrorBook(meta);
  }

  function listBooks() {
    return readMetadataList('books', idbListBooks);
  }

  async function updateBookCover(id, customCoverBlob) {
    markNativeDirty();
    await idbUpdateBookCover(id, customCoverBlob);
    const meta = await idbGetBook(id);
    if (meta) {
      upsertCachedBook(meta);
      await mirrorBook(meta);
    }
  }

  async function updateBookMeta(id, patch) {
    markNativeDirty();
    await idbUpdateBookMeta(id, patch);
    const meta = await idbGetBook(id);
    if (meta) {
      upsertCachedBook(meta);
      await mirrorBook(meta);
    }
  }

  function getSource(id) {
    return idbGetSource(id);
  }

  async function updateBookFavorite(id, favorite) {
    markNativeDirty();
    await idbUpdateBookFavorite(id, favorite);
    const meta = await idbGetBook(id);
    if (meta) {
      upsertCachedBook(meta);
      await mirrorBook(meta);
    }
  }

  function listCollections() {
    return readMetadataList('collections', idbListCollections);
  }

  async function saveCollections(collections) {
    markNativeDirty();
    await idbSaveCollections(collections);
    replaceCachedCollections(collections);
    if (!canUseNativeMetadata()) return;
    const written = await queueNativeMirror(() => saveNativeCollections(collections));
    if (written) replaceCachedCollections(collections);
  }

  // ---- 阅读进度：按书籍 id 记录当前位置，翻页时高频写入 ----
  async function saveProgress(record) {
    markNativeDirty();
    await idbSaveProgress(record);
    upsertCachedProgress(record);
    if (!canUseNativeMetadata()) return;
    const written = await queueNativeMirror(() => saveNativeProgress(record));
    if (written) upsertCachedProgress(record);
  }

  async function getProgress(id) {
    const snapshot = await getNativeSnapshot();
    if (snapshot) return snapshot.progress.find(record => record?.id === id);
    return idbGetProgress(id);
  }

  function listProgress() {
    return readMetadataList('progress', idbListProgress);
  }

  async function clearProgress() {
    markNativeDirty();
    await idbClearProgress();
    clearCachedProgress();
    if (!canUseNativeMetadata()) return;
    const written = await queueNativeMirror(clearNativeProgress);
    if (written) clearCachedProgress();
  }

  async function deleteBook(id) {
    markNativeDirty();
    // 先提交元数据删除，再回收原始文件；事务失败时不能留下「记录还在、源文件已删」的坏书。
    if (!disabled) {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_BOOKS, STORE_SOURCES, STORE_PROGRESS], 'readwrite');
        tx.objectStore(STORE_BOOKS).delete(id);
        tx.objectStore(STORE_SOURCES).delete(id);
        tx.objectStore(STORE_PROGRESS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    removeCachedBook(id);
    if (canUseNativeMetadata()) {
      const written = await queueNativeMirror(() => deleteNativeBook(id));
      if (written) removeCachedBook(id);
    }
    await Promise.allSettled([removeBookDir(id), removeNativeBookDir(id)]);
  }

  async function clear() {
    markNativeDirty();
    // 清空也必须先完成元数据事务，再由调用方在互斥队列内回收源文件。
    if (!disabled) {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_BOOKS, STORE_SOURCES, STORE_PROGRESS, STORE_COLLECTIONS], 'readwrite');
        tx.objectStore(STORE_BOOKS).clear();
        tx.objectStore(STORE_SOURCES).clear();
        tx.objectStore(STORE_PROGRESS).clear();
        tx.objectStore(STORE_COLLECTIONS).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    nativeSnapshot = null;
    if (canUseNativeMetadata()) {
      const written = await queueNativeMirror(clearNativeMetadata);
      if (written) nativeSnapshot = null;
    }
    await Promise.allSettled([clearAll(), clearNativeSources()]);
  }

  // 存储用量：usage/quota 来自浏览器估算，用于书架展示与配额预警
  async function estimateStorage() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return null;
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota, ratio: quota > 0 ? usage / quota : 0 };
    } catch (err) {
      return null;
    }
  }

  // 申请「持久存储」，避免浏览器清理缓存时把书架一起清掉
  async function requestPersistence() {
    try {
      if (!navigator.storage || typeof navigator.storage.persisted !== 'function') {
        return { supported: false, persisted: false };
      }
      let persisted = await navigator.storage.persisted();
      if (!persisted && typeof navigator.storage.persist === 'function') {
        persisted = await navigator.storage.persist();
      }
      return { supported: true, persisted: !!persisted };
    } catch (err) {
      console.warn('[HomuraStore] 无法申请持久存储', err);
      return { supported: true, persisted: false };
    }
  }

  return {
    saveBook,
    listBooks,
    updateBookCover,
    updateBookMeta,
    updateBookFavorite,
    getSource,
    listCollections,
    saveCollections,
    saveProgress,
    getProgress,
    listProgress,
    clearProgress,
    deleteBook,
    clear,
    estimateStorage,
    requestPersistence,
    get disabled() {
      return disabled;
    }
  };
})();
