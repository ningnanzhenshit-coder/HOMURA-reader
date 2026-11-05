import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseCbzFileLazy } from '../src/services/cbzParser.js';
import {
  closeNativeArchive,
  shouldFallbackNativeArchive
} from '../src/services/nativeArchive.js';
import { nativeFilePath } from '../src/services/nativeStorage.js';

const calls = [];
let invokeHandler = async () => null;

async function invoke(command, args) {
  calls.push({ command, args });
  return invokeHandler(command, args);
}

globalThis.window = {
  __TAURI__: {
    core: {
      invoke,
      convertFileSrc: path => `asset://localhost/${encodeURIComponent(path)}`
    }
  },
  __TAURI_INTERNALS__: {
    invoke
  }
};

afterEach(() => {
  calls.length = 0;
  invokeHandler = async () => null;
});

async function makeCbz() {
  const zip = new JSZip();
  zip.file('pages/001.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], 'fallback.cbz', { type: 'application/zip' });
}

test('桌面原生压缩包成功时直接使用 Rust 会话，不调用 JSZip', async () => {
  invokeHandler = async (command, args) => {
    if (command === 'open') {
      return {
        archiveId: args.archiveId,
        entries: [{
          index: 0,
          name: 'pages/001.jpg',
          path: 'pages/001.jpg',
          size: 4,
          mime: 'image/jpeg'
        }]
      };
    }
    if (command === 'extract') {
      return {
        path: '/cache/homura-native-pages/desktop-cbz/00000.jpg',
        mime: 'image/jpeg',
        size: 4
      };
    }
    if (command === 'plugin:fs|read_file') {
      return [0xff, 0xd8, 0xff, 0xd9];
    }
    if (command === 'close' || command === 'clearBook') return null;
    throw new Error(`未模拟桌面命令：${command}`);
  };

  const file = {
    name: 'desktop.cbz',
    size: 4,
    arrayBuffer() {
      throw new Error('原生成功后不应调用 JSZip');
    }
  };
  const archiveId = 'desktop-cbz';
  const book = await parseCbzFileLazy(file, {
    id: archiveId,
    name: 'desktop.cbz',
    nativePath: 'homura-native-sources/desktop-cbz/source/desktop.cbz',
    staged: true
  });

  try {
    assert.equal(book.nativeArchiveId, archiveId);
    assert.equal(book.nativeArchivePath, 'homura-native-sources/desktop-cbz/source/desktop.cbz');
    assert.equal(book.pageCount, 1);
    assert.equal(book.nativeArchiveStaged, true);
    assert.equal(book.zipContent, undefined);
    assert.equal(calls[0].command, 'open');
    assert.equal(calls.some(call => call.command.startsWith('plugin:android-archive')), false);
  } finally {
    if (book.cover?.startsWith('blob:')) URL.revokeObjectURL(book.cover);
    await closeNativeArchive(archiveId);
  }
});

test('桌面普通原生失败会回退 JSZip', async () => {
  invokeHandler = async command => {
    if (command === 'open') throw 'NATIVE_COMMAND_FAILED: 桌面 ZIP 打开失败';
    if (command === 'close' || command === 'clearBook') return null;
    throw new Error(`未模拟桌面命令：${command}`);
  };

  const book = await parseCbzFileLazy(await makeCbz(), {
    id: 'desktop-fallback',
    nativePath: 'homura-native-sources/desktop-fallback/source/fallback.cbz'
  });

  try {
    assert.ok(book?.pageItems?.[0]?.zipEntry);
    assert.equal(book.nativeArchiveId, undefined);
    assert.equal(book.pageCount, 1);
    assert.equal(calls.some(call => call.command === 'open'), true);
    assert.equal(calls.some(call => call.command === 'close'), true);
    assert.equal(calls.some(call => call.command === 'clearBook'), true);
  } finally {
    if (book?.cover?.startsWith('blob:')) URL.revokeObjectURL(book.cover);
  }
});

test('桌面路径越界与条目超限不会退化为 JSZip', async () => {
  for (const error of [
    'NATIVE_SECURITY_LIMIT: 压缩包路径不在 HOMURA 存档目录内',
    'NATIVE_LIMIT_EXCEEDED: 压缩包条目数量过多'
  ]) {
    calls.length = 0;
    invokeHandler = async command => {
      if (command === 'open') throw error;
      if (command === 'close' || command === 'clearBook') return null;
      throw new Error(`未模拟桌面命令：${command}`);
    };

    const file = {
      name: 'blocked.cbz',
      size: 1,
      arrayBuffer() {
        throw new Error('安全限制错误不应回退 JSZip');
      }
    };
    await assert.rejects(
      parseCbzFileLazy(file, {
        id: 'desktop-blocked',
        nativePath: 'homura-native-sources/desktop-blocked/source/blocked.cbz'
      }),
      candidate => candidate.code === error.slice(0, error.indexOf(':'))
    );
    assert.equal(calls.some(call => call.command === 'extract'), false);
  }
});

test('原生归档兜底白名单不包含安全限制和超限错误', () => {
  assert.equal(
    shouldFallbackNativeArchive({ code: 'NATIVE_COMMAND_FAILED', message: '普通失败' }),
    true
  );
  assert.equal(
    shouldFallbackNativeArchive({ code: 'NATIVE_INVALID_DATA', message: '损坏' }),
    true
  );
  assert.equal(
    shouldFallbackNativeArchive({ code: 'NATIVE_SECURITY_LIMIT', message: '越界' }),
    false
  );
  assert.equal(
    shouldFallbackNativeArchive({ code: 'NATIVE_LIMIT_EXCEEDED', message: '超限' }),
    false
  );
});

test('原生存档路径不会保留 . 或 .. 目录段', () => {
  assert.equal(nativeFilePath('..', 'source/book.cbz'), 'homura-native-sources/source/source/book.cbz');
  assert.equal(nativeFilePath('book-1', '../source/book.cbz'), 'homura-native-sources/book-1/source/source/book.cbz');
});
