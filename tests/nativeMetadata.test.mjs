import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadNativeMetadata,
  replaceNativeMetadata
} from '../src/services/nativeMetadata.js';
import {
  bytesToBase64,
  resetNativeRuntimeState
} from '../src/services/nativeRuntime.js';

const originalWindow = globalThis.window;
const originalIndexedDB = globalThis.indexedDB;
const originalLocalStorage = globalThis.localStorage;

function installNative(invoke) {
  globalThis.window = {
    ...(globalThis.window || {}),
    __TAURI__: { core: { invoke } }
  };
}

function installIndexedDb(records, onTransactionComplete = () => {}) {
  const data = {
    books: records.books || [],
    sources: records.sources || [],
    collections: records.collections || [],
    progress: records.progress || []
  };
  const makeStore = name => ({
    getAll() {
      return { result: data[name].slice() };
    },
    get(id) {
      return { result: data[name].find(item => item.id === id) };
    },
    delete(id) {
      data[name] = data[name].filter(item => item.id !== id);
    },
    clear() {
      data[name] = [];
    },
    put() {}
  });
  const database = {
    close() {},
    transaction(storeNames, mode) {
      const tx = {};
      tx.objectStore = name => makeStore(name);
      queueMicrotask(() => {
        onTransactionComplete(storeNames, mode);
        tx.oncomplete?.();
      });
      return tx;
    }
  };
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    }
  };
  globalThis.indexedDB = indexedDB;
  globalThis.window = {
    ...(globalThis.window || {}),
    indexedDB
  };
}

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalIndexedDB === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = originalIndexedDB;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  resetNativeRuntimeState();
});

test('SQLite 书目会把封面 Base64 还原为 Blob', async () => {
  const cover = new Uint8Array([1, 2, 3, 4]);
  installNative(async command => {
    assert.equal(command, 'metadata_load');
    return {
      initialized: true,
      books: [{
        id: 'book-1',
        type: 'novel',
        format: 'txt',
        title: '测试书',
        favorite: true,
        pageCount: 3,
        addedAt: 10,
        coverBase64: bytesToBase64(cover),
        coverMime: 'image/webp',
        customCoverBase64: null,
        customCoverMime: null
      }],
      collections: [{
        id: 'collection-1',
        title: '书库',
        createdAt: 20,
        bookIds: ['book-1']
      }],
      progress: [{ id: 'book-1', ratio: 0.5 }]
    };
  });

  const snapshot = await loadNativeMetadata();
  assert.equal(snapshot.initialized, true);
  assert.equal(snapshot.books[0].coverBlob.type, 'image/webp');
  assert.deepEqual(new Uint8Array(await snapshot.books[0].coverBlob.arrayBuffer()), cover);
  assert.deepEqual(snapshot.collections[0].bookIds, ['book-1']);
  assert.equal(snapshot.progress[0].ratio, 0.5);
});

test('完整迁移会把 Blob 封面序列化进 SQLite 快照', async () => {
  const calls = [];
  installNative(async (command, args) => {
    calls.push({ command, args });
    return null;
  });
  const cover = new Uint8Array([5, 6, 7]);

  await replaceNativeMetadata({
    books: [{
      id: 'book-1',
      type: 'manga',
      format: 'cbz',
      title: '漫画',
      favorite: false,
      pageCount: 10,
      addedAt: 30,
      coverBlob: new Blob([cover], { type: 'image/webp' }),
      customCoverBlob: null
    }],
    collections: [],
    progress: [{ id: 'book-1', index: 2, updatedAt: 40 }]
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'metadata_replace_all');
  assert.equal(calls[0].args.snapshot.books[0].coverBase64, bytesToBase64(cover));
  assert.equal(calls[0].args.snapshot.books[0].coverMime, 'image/webp');
  assert.equal(calls[0].args.snapshot.progress[0].index, 2);
});

test('原生初始化读取不会触发 IndexedDB 全量扫描', async () => {
  installIndexedDb({
    books: [{ id: 'idb-book', title: '不该读取' }],
    collections: [],
    progress: []
  });
  let calls = 0;
  installNative(async command => {
    calls++;
    assert.equal(command, 'metadata_load');
    return {
      initialized: true,
      books: [{
        id: 'native-book',
        type: 'novel',
        format: 'txt',
        title: '原生书',
        favorite: false,
        pageCount: 1,
        addedAt: 1,
        coverBase64: null,
        coverMime: null,
        customCoverBase64: null,
        customCoverMime: null
      }],
      collections: [],
      progress: []
    };
  });

  const { HomuraStore } = await import('../src/services/storage.js?native-first');
  assert.deepEqual((await HomuraStore.listBooks()).map(book => book.id), ['native-book']);
  assert.deepEqual(await HomuraStore.listCollections(), []);
  assert.deepEqual(await HomuraStore.listProgress(), []);
  assert.equal(calls, 1);
});

test('首次启用 SQLite 时从 IndexedDB 原子迁移书目与进度', async () => {
  installIndexedDb({
    books: [{
      id: 'book-1',
      type: 'novel',
      format: 'txt',
      title: '旧书',
      favorite: true,
      pageCount: 2,
      addedAt: 5
    }],
    collections: [{
      id: 'collection-1',
      title: '旧书库',
      createdAt: 6,
      bookIds: ['book-1']
    }],
    progress: [{ id: 'book-1', ratio: 0.4, updatedAt: 7 }]
  });
  let replacePayload = null;
  installNative(async (command, args) => {
    if (command === 'metadata_load') {
      return { initialized: false, books: [], collections: [], progress: [] };
    }
    if (command === 'metadata_replace_all') {
      replacePayload = args.snapshot;
      return null;
    }
    throw new Error(`未模拟命令：${command}`);
  });

  const { HomuraStore } = await import('../src/services/storage.js?native-migration');
  const books = await HomuraStore.listBooks();
  assert.deepEqual(books.map(book => book.id), ['book-1']);
  assert.equal(replacePayload.books[0].title, '旧书');
  assert.equal(replacePayload.collections[0].bookIds[0], 'book-1');
  assert.equal(replacePayload.progress[0].ratio, 0.4);
  assert.deepEqual(await HomuraStore.listCollections(), [{
    id: 'collection-1',
    title: '旧书库',
    createdAt: 6,
    bookIds: ['book-1']
  }]);
});

test('dirty 标记会跳过原生读取并从 IndexedDB 重建镜像', async () => {
  installIndexedDb({
    books: [{
      id: 'recovered-book',
      type: 'novel',
      format: 'txt',
      title: '恢复书',
      favorite: false,
      pageCount: 1,
      addedAt: 1
    }],
    collections: [],
    progress: [{ id: 'recovered-book', ratio: 0.1 }]
  });
  const markerValues = new Map([['homura-native-metadata-dirty', '1']]);
  globalThis.localStorage = {
    getItem(key) {
      return markerValues.get(key) ?? null;
    },
    setItem(key, value) {
      markerValues.set(key, String(value));
    },
    removeItem(key) {
      markerValues.delete(key);
    }
  };
  const commands = [];
  installNative(async (command, args) => {
    commands.push(command);
    if (command === 'metadata_replace_all') {
      assert.equal(args.snapshot.books[0].id, 'recovered-book');
      return null;
    }
    throw new Error(`dirty 恢复不应调用：${command}`);
  });

  const { HomuraStore } = await import('../src/services/storage.js?native-dirty');
  const books = await HomuraStore.listBooks();
  assert.deepEqual(books.map(book => book.id), ['recovered-book']);
  assert.deepEqual(commands, ['metadata_replace_all']);
  assert.equal(globalThis.localStorage.getItem('homura-native-metadata-dirty'), null);
});

test('删除先提交 IndexedDB 事务，再删 SQLite 镜像', async () => {
  let metadataVersion = 0;
  let nativeDeleteVersion = -1;
  installIndexedDb({
    books: [{ id: 'book-1', title: '书' }],
    sources: [{ id: 'book-1' }],
    collections: [],
    progress: [{ id: 'book-1', ratio: 0.2 }]
  }, (storeNames, mode) => {
    if (mode === 'readwrite') metadataVersion++;
  });
  installNative(async (command, args) => {
    if (command === 'metadata_delete_book') {
      nativeDeleteVersion = metadataVersion;
      assert.equal(args.bookId, 'book-1');
      return null;
    }
    if (command === 'clearBook') return null;
    throw new Error(`未模拟命令：${command}`);
  });

  const { HomuraStore } = await import('../src/services/storage.js?native-delete');
  await HomuraStore.deleteBook('book-1');
  assert.equal(metadataVersion, 1);
  assert.equal(nativeDeleteVersion, 1);
});
