import test from 'node:test';
import assert from 'node:assert/strict';
import { HomuraStore } from '../src/services/storage.js';

test('删除与清空先提交 IndexedDB，再回收 OPFS 原始文件', async t => {
  const originalWindow = globalThis.window;
  const originalIndexedDB = globalThis.indexedDB;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let metadataVersion = 0;
  let failNextTransaction = false;
  const removedBookDirs = [];
  const removedRoots = [];

  const sourceRoot = {
    async removeEntry(name) {
      removedBookDirs.push({ name, metadataVersion });
    }
  };
  const storageRoot = {
    async getDirectoryHandle(name) {
      assert.equal(name, 'homura-sources');
      return sourceRoot;
    },
    async removeEntry(name) {
      removedRoots.push({ name, metadataVersion });
    }
  };
  const fakeDb = {
    close() {},
    transaction() {
      const tx = {
        objectStore() {
          return {
            delete() {},
            clear() {}
          };
        }
      };
      queueMicrotask(() => {
        if (failNextTransaction) {
          failNextTransaction = false;
          tx.error = new Error('IndexedDB 写入失败');
          tx.onerror?.();
          return;
        }
        metadataVersion++;
        tx.oncomplete?.();
      });
      return tx;
    }
  };
  const fakeIndexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = fakeDb;
        request.onsuccess?.();
      });
      return request;
    }
  };

  globalThis.window = { indexedDB: fakeIndexedDB };
  globalThis.indexedDB = fakeIndexedDB;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        async getDirectory() {
          return storageRoot;
        }
      }
    }
  });
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.indexedDB = originalIndexedDB;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  });

  await HomuraStore.deleteBook('book-1');
  assert.equal(metadataVersion, 1);
  assert.deepEqual(removedBookDirs, [{ name: 'book-1', metadataVersion: 1 }]);
  assert.deepEqual(removedRoots, []);

  metadataVersion = 0;
  removedBookDirs.length = 0;
  await HomuraStore.clear();
  assert.deepEqual(removedRoots, [{ name: 'homura-sources', metadataVersion: 1 }]);
  assert.deepEqual(removedBookDirs, []);

  metadataVersion = 0;
  removedRoots.length = 0;
  failNextTransaction = true;
  await assert.rejects(HomuraStore.deleteBook('book-2'), /IndexedDB 写入失败/);
  assert.deepEqual(removedBookDirs, []);
  assert.deepEqual(removedRoots, []);

  failNextTransaction = true;
  await assert.rejects(HomuraStore.clear(), /IndexedDB 写入失败/);
  assert.deepEqual(removedRoots, []);
});
