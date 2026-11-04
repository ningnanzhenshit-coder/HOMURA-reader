/* ============================================================================
   HOMURA 书架本地存档（IndexedDB）
   ----------------------------------------------------------------------------
   books    : 书架元数据（标题 / 类型 / 页数 / 封面 Blob）
   sources  : 原始文件。桌面端优先存 FileSystemFileHandle（不占浏览器配额）；
              Android 存原生 AppData 相对路径，其余平台存 OPFS 或 IndexedDB Blob。
   progress : 每本书的阅读进度（页码索引 / 总页数 / 比例）
   浏览器禁用 IndexedDB（例如直接 file:// 打开）时自动降级为纯内存模式。
   ========================================================================== */

import { removeBookDir, clearAll } from './opfs.js';
import { clearNativeSources, removeNativeBookDir } from './nativeStorage.js';

export const HomuraStore = (() => {
  const DB_NAME = 'homura_shelf';
  const DB_VERSION = 3;
  const STORE_BOOKS = 'books';
  const STORE_SOURCES = 'sources';
  const STORE_PROGRESS = 'progress';
  const STORE_COLLECTIONS = 'collections';
  let dbPromise = null;
  let disabled = false;

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
  function saveBook(meta, source) {
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

  function listBooks() {
    return run(STORE_BOOKS, 'readonly', store => store.getAll()).then(list => list || []);
  }

  function updateBookCover(id, customCoverBlob) {
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

  function getSource(id) {
    return run(STORE_SOURCES, 'readonly', store => store.get(id));
  }

  function updateBookFavorite(id, favorite) {
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

  function listCollections() {
    return run(STORE_COLLECTIONS, 'readonly', store => store.getAll()).then(list => list || []);
  }

  // 整批写入归属，移动多个书本时不会留下同时属于两个书库的中间状态。
  function saveCollections(collections) {
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

  // ---- 阅读进度：按书籍 id 记录当前位置，翻页时高频写入 ----
  function saveProgress(record) {
    return run(STORE_PROGRESS, 'readwrite', store => store.put(record));
  }

  function getProgress(id) {
    return run(STORE_PROGRESS, 'readonly', store => store.get(id));
  }

  function listProgress() {
    return run(STORE_PROGRESS, 'readonly', store => store.getAll()).then(list => list || []);
  }

  function clearProgress() {
    return run(STORE_PROGRESS, 'readwrite', store => store.clear());
  }

  async function deleteBook(id) {
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
    await Promise.allSettled([removeBookDir(id), removeNativeBookDir(id)]);
  }

  async function clear() {
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
