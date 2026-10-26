/* ============================================================================
   HOMURA 书架本地存档（IndexedDB）
   ----------------------------------------------------------------------------
   books    : 书架元数据（标题 / 类型 / 页数 / 封面 Blob）
   sources  : 原始文件。优先存 FileSystemFileHandle（不占浏览器配额），
              不支持时降级为原始 Blob 副本。
   浏览器禁用 IndexedDB（例如直接 file:// 打开）时自动降级为纯内存模式。
   ========================================================================== */
const HomuraStore = (() => {
  const DB_NAME = 'homura_shelf';
  const DB_VERSION = 1;
  const STORE_BOOKS = 'books';
  const STORE_SOURCES = 'sources';
  let dbPromise = null;
  let disabled = false;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB 不可用'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_BOOKS)) db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_SOURCES)) db.createObjectStore(STORE_SOURCES, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
      req.onblocked = () => reject(new Error('IndexedDB 被其它标签页占用'));
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

  function getSource(id) {
    return run(STORE_SOURCES, 'readonly', store => store.get(id));
  }

  function deleteBook(id) {
    if (disabled) return Promise.resolve();
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_BOOKS, STORE_SOURCES], 'readwrite');
      tx.objectStore(STORE_BOOKS).delete(id);
      tx.objectStore(STORE_SOURCES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function clear() {
    if (disabled) return Promise.resolve();
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_BOOKS, STORE_SOURCES], 'readwrite');
      tx.objectStore(STORE_BOOKS).clear();
      tx.objectStore(STORE_SOURCES).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  // 申请「持久存储」，避免浏览器清理缓存时把书架一起清掉
  function requestPersistence() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return;
      navigator.storage.persisted()
        .then(persisted => (persisted ? null : navigator.storage.persist()))
        .catch(() => {});
    } catch (e) {}
  }

  return {
    saveBook,
    listBooks,
    getSource,
    deleteBook,
    clear,
    requestPersistence,
    get disabled() {
      return disabled;
    }
  };
})();
