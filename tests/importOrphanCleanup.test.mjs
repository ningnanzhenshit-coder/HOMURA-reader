import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// pdf.js 的 worker 用 ?url 导入，node 里换成假地址。
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

const calls = [];
let stageHandler = async () => {
  throw new Error('未模拟暂存行为');
};

// 模拟 Tauri 桥：stageImportPath 走 stageHandler，其余命令记录后返回成功。
globalThis.window = {
  indexedDB: null,
  __TAURI__: {
    core: {
      invoke: async (command, args) => {
        calls.push({ command, args });
        if (command === 'stageImportPath') return stageHandler(command, args);
        return null;
      }
    }
  }
};

const { createPinia, setActivePinia } = await import('pinia');
const { useShelfStore } = await import('../src/stores/shelf.js');
const { useImporter } = await import('../src/composables/useImporter.js');
const { HomuraStore } = await import('../src/services/storage.js');

// 落盘层换成内存桩，避免测试依赖真实 IndexedDB。
function stubStore(t) {
  const originals = {
    requestPersistence: HomuraStore.requestPersistence,
    saveBook: HomuraStore.saveBook
  };
  HomuraStore.requestPersistence = async () => ({ supported: true, persisted: true });
  HomuraStore.saveBook = async () => {};
  t.after(() => Object.assign(HomuraStore, originals));
}

function silenceLogs(t) {
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};
  t.after(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });
}

function makeNativeCbz(bookName = 'sample.cbz') {
  // 原生导入文件：有 nativePath 且不是 Blob 实例，isNativeImportFile 才会认。
  return {
    name: bookName,
    size: 4,
    lastModified: 1,
    type: 'application/vnd.comicbook+zip',
    nativePath: `/Users/demo/${bookName}`
  };
}

function removedDirs() {
  return calls
    .filter(call => call.command === 'clearBook')
    .map(call => call.args.bookId);
}

test('原生预存被安全规则拒绝时不回退，但会回收半成品目录', async t => {
  silenceLogs(t);
  calls.length = 0;
  setActivePinia(createPinia());
  const shelf = useShelfStore();
  const importer = useImporter();

  stageHandler = async () => {
    throw 'NATIVE_SECURITY_LIMIT: 导入目标不在 HOMURA 存档目录内';
  };

  const ids = await importer.handleFiles([makeNativeCbz()]);

  assert.equal(ids?.length || 0, 0, '被安全规则拒绝的书不能进书架');
  assert.equal(shelf.library.length, 0);
  const removed = removedDirs();
  assert.equal(removed.length, 1, '半成品 AppData 目录必须被回收');
  assert.match(removed[0], /^cbz_/);
  assert.equal(
    calls.some(call => call.command === 'plugin:android-archive|open' || call.command === 'open'),
    false,
    '安全拒绝不能触发原生解析'
  );
});

test('原生预存普通失败仍回退 JSZip，并清掉失败目录', async t => {
  silenceLogs(t);
  calls.length = 0;
  setActivePinia(createPinia());
  const shelf = useShelfStore();
  const importer = useImporter();

  stageHandler = async () => {
    throw 'NATIVE_COMMAND_FAILED: 复制导入文件失败';
  };

  const ids = await importer.handleFiles([makeNativeCbz()]);

  // 回退分支会尝试把原生文件读成 Blob；读失败则这本跳过，但目录必须已回收。
  assert.equal(ids?.length || 0, 0);
  assert.equal(shelf.library.length, 0);
  assert.ok(removedDirs().length >= 1, '失败暂存目录不能留下来');
});

test('导入成功时 handleFiles 返回本批入架的书籍 id', async t => {
  silenceLogs(t);
  calls.length = 0;
  setActivePinia(createPinia());
  stubStore(t);
  const shelf = useShelfStore();
  const importer = useImporter();

  // 普通 File 走 TXT 解析，不需要原生暂存，直接验证返回值透传。
  const ids = await importer.handleFiles([new File(['第一章\n正文内容'], 'sample.txt')]);

  assert.ok(Array.isArray(ids), 'handleFiles 必须返回 id 数组');
  assert.equal(ids.length, 1);
  assert.equal(ids[0], shelf.library[0].id, '返回的 id 应指向刚入架的书');
  assert.equal(shelf.library.length, 1);
});
