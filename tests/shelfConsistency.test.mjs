import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

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
