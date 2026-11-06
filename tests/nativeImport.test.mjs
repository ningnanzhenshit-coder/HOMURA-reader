import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
let dialogResult = null;
let scanResult = { files: [] };
let stageResult = null;

globalThis.window = {
  __TAURI__: {
    core: {
      invoke: async (command, args) => {
        calls.push({ command, args });
        if (command === 'plugin:dialog|open') return dialogResult;
        if (command === 'scanImportPaths') return scanResult;
        if (command === 'stageImportPath') return stageResult;
        throw new Error(`未模拟原生命令：${command}`);
      }
    }
  }
};

const {
  isNativeImportFile,
  makeNativeImportFile,
  nativeImportMime,
  pickNativeImportPaths,
  scanNativeImportPaths,
  shouldFallbackNativeImport,
  stageNativeImportPath
} = await import('../src/services/nativeImport.js');

test('桌面文件选择器请求多选并对文件夹开启递归授权', async () => {
  dialogResult = ['/Users/demo/Downloads/manga'];
  const paths = await pickNativeImportPaths({ directory: true, multiple: false });
  assert.deepEqual(paths, ['/Users/demo/Downloads/manga']);
  assert.equal(calls[0].command, 'plugin:dialog|open');
  assert.equal(calls[0].args.options.directory, true);
  assert.equal(calls[0].args.options.recursive, true);
  assert.equal(calls[0].args.options.multiple, false);

  calls.length = 0;
  dialogResult = ['/Users/demo/a.epub', '/Users/demo/b.cbz'];
  const files = await pickNativeImportPaths({ directory: false, multiple: true });
  assert.deepEqual(files, dialogResult);
  assert.equal(calls[0].args.options.directory, false);
  assert.equal(calls[0].args.options.filters[0].extensions.includes('epub'), true);
});

test('扫描结果转换成带相对路径的轻量文件对象', () => {
  const file = makeNativeImportFile({
    name: '001.jpg',
    path: '/Users/demo/manga/chapter/001.jpg',
    relativePath: 'manga/chapter/001.jpg',
    size: 128,
    modifiedMs: 1234
  });
  assert.equal(file.nativePath, '/Users/demo/manga/chapter/001.jpg');
  assert.equal(file.customRelativePath, 'manga/chapter/001.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.equal(isNativeImportFile(file), true);
  assert.equal(nativeImportMime('book.kepub.epub'), 'application/epub+zip');
  assert.equal(nativeImportMime('BOOK.CBZ'), 'application/vnd.comicbook+zip');
});

test('扫描扫描命令只接收路径并返回原生命名结果', async () => {
  scanResult = {
    files: [{
      name: 'book.epub',
      path: '/Users/demo/book.epub',
      relativePath: 'book.epub',
      size: 42,
      modifiedMs: 10
    }]
  };
  const files = await scanNativeImportPaths(['/Users/demo/book.epub']);
  assert.equal(files.length, 1);
  assert.equal(calls.at(-1).command, 'scanImportPaths');
  assert.deepEqual(calls.at(-1).args.paths, ['/Users/demo/book.epub']);
});

test('原生暂存返回 AppData 相对路径，且安全错误不会回退', async () => {
  stageResult = {
    nativePath: 'homura-native-sources/book-1/source/book.epub',
    name: 'book.epub',
    size: 42,
    modifiedMs: 10
  };
  const staged = await stageNativeImportPath('book-1', '/Users/demo/book.epub');
  assert.equal(staged.nativePath, 'homura-native-sources/book-1/source/book.epub');
  assert.equal(calls.at(-1).command, 'stageImportPath');
  assert.deepEqual(calls.at(-1).args, {
    bookId: 'book-1',
    sourcePath: '/Users/demo/book.epub'
  });

  assert.equal(shouldFallbackNativeImport({ code: 'NATIVE_COMMAND_FAILED', message: '普通失败' }), true);
  assert.equal(shouldFallbackNativeImport({ code: 'NATIVE_INVALID_DATA', message: '文件损坏' }), true);
  assert.equal(shouldFallbackNativeImport({ code: 'NATIVE_SECURITY_LIMIT', message: '越界' }), false);
  assert.equal(shouldFallbackNativeImport({ code: 'NATIVE_LIMIT_EXCEEDED', message: '过大' }), false);
});
