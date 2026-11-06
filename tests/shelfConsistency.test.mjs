import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { watch } from 'vue';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('?url')) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent('export default "fake-worker.mjs";'),
        shortCircuit: true
      };
    }
    return nextResolve(specifier, context);
  }
});

globalThis.window = { indexedDB: null };
const { createPinia, setActivePinia } = await import('pinia');
const { HomuraStore } = await import('../src/services/storage.js');
const { useShelfStore } = await import('../src/stores/shelf.js');
const { useImporter } = await import('../src/composables/useImporter.js');

function makeStore() {
  setActivePinia(createPinia());
  return useShelfStore();
}

function makeBook(id = 'book-1') {
  return { id, type: 'novel', format: 'txt', title: id, pageCount: 1 };
}

function makeSource() {
  return { kind: 'file', name: 'sample.txt', size: 1, lastModified: 1, handle: {} };
}

test('书本删除和清空后回收媒体，事务失败时仍然可打开', async t => {
  const store = makeStore();
  silenceExpectedLogs(t);
  const cover = URL.createObjectURL(new Blob(['cover']));
  const page = URL.createObjectURL(new Blob(['page']));
  t.after(() => [cover, page].forEach(URL.revokeObjectURL));
  store.library = [{ ...makeBook(), cover }, { ...makeBook('book-2'), pageItems: [{ url: page }] }];
  let fail = true;
  stubStore(t, {
    deleteBook: async () => { if (fail) throw new Error('事务失败'); },
    clear: async () => {}
  });
  await assert.rejects(store.removeBook('book-1'), /事务失败/);
  assert.equal(await (await fetch(cover)).text(), 'cover');
  fail = false;
  await store.removeBook('book-1');
  await assert.rejects(fetch(cover));
  assert.equal(await (await fetch(page)).text(), 'page');
  await store.clearShelf();
  await assert.rejects(fetch(page));
});

function stubStore(t, overrides) {
  const originals = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = HomuraStore[key];
    HomuraStore[key] = value;
  }
  t.after(() => {
    Object.assign(HomuraStore, originals);
  });
}

function silenceExpectedLogs(t) {
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  t.after(() => {
    console.error = originalError;
    console.warn = originalWarn;
  });
}

function stubOpfsBookCleanup(t) {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const removedDirs = [];
  const sourceRoot = {
    async removeEntry(name, options) {
      removedDirs.push({ name, recursive: !!options?.recursive });
    }
  };
  const storageRoot = {
    async getDirectoryHandle(name) {
      assert.equal(name, 'homura-sources');
      return sourceRoot;
    }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'node',
      storage: {
        async getDirectory() {
          return storageRoot;
        }
      }
    }
  });
  t.after(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  });
  return removedDirs;
}

async function waitFor(predicate, message) {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail(message);
}

test('导入只有在存档提交成功后才公开书本', async t => {
  const store = makeStore();
  let releaseSave;
  stubStore(t, {
    requestPersistence: async () => ({ supported: true, persisted: true }),
    saveBook: () => new Promise(resolve => {
      releaseSave = resolve;
    })
  });

  const task = store.addBook(makeBook(), makeSource());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.library.length, 0, '落盘未完成时不应先出现在书架');

  releaseSave();
  await task;
  assert.deepEqual(store.library.map(book => book.id), ['book-1']);
});

test('导入到新书库时，书本与归属一起写入且首次出现就在库内', async t => {
  const store = makeStore();
  const target = { id: 'target', title: '测试书库', createdAt: 1, bookIds: [] };
  let releaseSave;
  stubStore(t, {
    requestPersistence: async () => ({}),
    saveBook: (meta, source, collection) => new Promise(resolve => {
      assert.equal(meta.id, source.id);
      assert.deepEqual(collection, { ...target, bookIds: [meta.id] });
      releaseSave = resolve;
    })
  });
  const stop = watch(() => store.library, books => {
    assert.deepEqual(store.booksInCollection(target.id), books);
  }, { flush: 'sync' });
  t.after(stop);

  const task = store.addBook(makeBook(), makeSource(), target);
  await waitFor(() => releaseSave, '未进入书籍与书库的保存步骤');
  assert.deepEqual(store.library, []);
  assert.deepEqual(store.collections, []);
  releaseSave();
  await task;
  assert.deepEqual(store.collections[0].bookIds, ['book-1']);
});

test('存档写入失败不会留下幽灵书', async t => {
  const store = makeStore();
  silenceExpectedLogs(t);
  const removedDirs = stubOpfsBookCleanup(t);
  stubStore(t, {
    requestPersistence: async () => ({ supported: true, persisted: true }),
    saveBook: async () => {
      throw new Error('配额不足');
    }
  });

  await assert.rejects(store.addBook(makeBook(), makeSource()), /配额不足/);
  assert.equal(store.library.length, 0);
  assert.deepEqual(removedDirs, [{ name: 'book-1', recursive: true }]);
});

test('删除元数据失败时保留书本、进度与书库归属', async t => {
  const store = makeStore();
  silenceExpectedLogs(t);
  store.unshiftBook(makeBook());
  store.setProgressRecord({ id: 'book-1', ratio: 0.5, index: 1, total: 2, updatedAt: 1 });
  stubStore(t, {
    deleteBook: async () => {
      throw new Error('IndexedDB 故障');
    }
  });

  await assert.rejects(store.removeBook('book-1'), /IndexedDB 故障/);
  assert.deepEqual(store.library.map(book => book.id), ['book-1']);
  assert.ok(store.progressMap['book-1']);
  assert.match(store.error, /IndexedDB 故障/);
});

test('移除成功会同步清理内存进度，避免设置页计数残留', async t => {
  const store = makeStore();
  store.unshiftBook(makeBook());
  store.setProgressRecord({ id: 'book-1', ratio: 0.5, index: 1, total: 2, updatedAt: 1 });
  stubStore(t, {
    deleteBook: async () => {}
  });

  await store.removeBook('book-1');
  assert.equal(store.library.length, 0);
  assert.equal(store.progressMap['book-1'], undefined);
});

test('清空书架失败时不提前清掉界面状态', async t => {
  const store = makeStore();
  silenceExpectedLogs(t);
  store.unshiftBook(makeBook());
  store.setProgressRecord({ id: 'book-1', ratio: 0.5, index: 1, total: 2, updatedAt: 1 });
  stubStore(t, {
    clear: async () => {
      throw new Error('IndexedDB 故障');
    }
  });

  await assert.rejects(store.clearShelf(), /IndexedDB 故障/);
  assert.deepEqual(store.library.map(book => book.id), ['book-1']);
  assert.ok(store.progressMap['book-1']);
});

test('实际导入与清空共用互斥队列，清空会等待导入完成', async t => {
  const store = makeStore();
  silenceExpectedLogs(t);
  let releaseSave;
  let saveStarted = false;
  let clearCalled = false;
  stubStore(t, {
    requestPersistence: async () => ({ supported: true, persisted: true }),
    saveBook: () => new Promise(resolve => {
      saveStarted = true;
      releaseSave = resolve;
    }),
    clear: async () => {
      clearCalled = true;
    }
  });
  const importer = useImporter();
  const importTask = importer.handleFiles([new File(['hello'], 'sample.txt')]);
  await waitFor(() => saveStarted, '导入没有开始写入存档');

  const clearTask = store.clearShelf();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(clearCalled, false, '导入未结束时不能开始清空');

  releaseSave();
  await importTask;
  await clearTask;
  assert.equal(clearCalled, true);
  assert.equal(store.library.length, 0);
});
