import test from 'node:test';
import assert from 'node:assert/strict';
import { HomuraStore } from '../src/services/storage.js';

test('IndexedDB 升级被占用时等待旧连接关闭，而不是永久禁用存储', async t => {
  const originalWindow = globalThis.window;
  const originalIndexedDB = globalThis.indexedDB;
  const originalWarn = console.warn;
  const warnings = [];
  let openCount = 0;
  let request = null;

  const fakeDb = {
    close() {},
    transaction() {
      const tx = {};
      const getAll = () => ({ result: [] });
      tx.objectStore = () => ({ getAll });
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    }
  };

  const fakeIndexedDB = {
    open() {
      openCount += 1;
      request = {};
      return request;
    }
  };

  globalThis.window = { indexedDB: fakeIndexedDB };
  globalThis.indexedDB = fakeIndexedDB;
  console.warn = (...args) => warnings.push(args.join(' '));
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.indexedDB = originalIndexedDB;
    console.warn = originalWarn;
  });

  let settled = false;
  const booksPromise = HomuraStore.listBooks().then(books => {
    settled = true;
    return books;
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(openCount, 1);

  request.onblocked?.();
  request.onblocked?.();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'blocked 后连接仍在等待，不能提前 reject');
  assert.equal(warnings.length, 1, '同一次升级只提示一次占用警告');

  request.result = fakeDb;
  request.onsuccess?.();
  assert.deepEqual(await booksPromise, []);
  assert.deepEqual(await HomuraStore.listBooks(), []);
});
