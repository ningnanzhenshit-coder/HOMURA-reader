import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCoverThumbnail } from '../src/services/coverThumb.js';
import { bytesToBase64, resetNativeRuntimeState } from '../src/services/nativeRuntime.js';

const originalWindow = globalThis.window;
const originalCreateImageBitmap = globalThis.createImageBitmap;
const originalOffscreenCanvas = globalThis.OffscreenCanvas;

function restoreGlobal(name, value) {
  if (value === undefined) delete globalThis[name];
  else globalThis[name] = value;
}

afterEach(() => {
  restoreGlobal('window', originalWindow);
  restoreGlobal('createImageBitmap', originalCreateImageBitmap);
  restoreGlobal('OffscreenCanvas', originalOffscreenCanvas);
  resetNativeRuntimeState();
});

test('Tauri 环境优先使用 Rust 封面缩略图', async () => {
  const calls = [];
  const output = new Uint8Array([8, 9, 10]);
  globalThis.window = {
    __TAURI__: {
      core: {
        async invoke(command, args) {
          calls.push({ command, args });
          return {
            changed: true,
            bytesBase64: bytesToBase64(output),
            mime: 'image/webp',
            width: 480,
            height: 320
          };
        }
      }
    }
  };

  const source = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
  const result = await createCoverThumbnail(source, 480);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'create_cover_thumbnail');
  assert.equal(calls[0].args.bytesBase64, bytesToBase64(new Uint8Array([1, 2, 3, 4])));
  assert.equal(calls[0].args.maxEdge, 480);
  assert.equal(result.type, 'image/webp');
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), output);
});

test('原生判断无需缩放时保留原始 Blob', async () => {
  globalThis.window = {
    __TAURI__: {
      core: {
        async invoke(command) {
          assert.equal(command, 'create_cover_thumbnail');
          return {
            changed: false,
            mime: 'image/png',
            width: 128,
            height: 128
          };
        }
      }
    }
  };

  const source = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  const result = await createCoverThumbnail(source);

  assert.equal(result, source);
});

test('原生不支持该图片格式时回退 Canvas', async () => {
  let bitmapClosed = false;
  globalThis.window = {
    __TAURI__: {
      core: {
        async invoke() {
          throw new Error('NATIVE_UNSUPPORTED: AVIF 需要浏览器解码');
        }
      }
    }
  };
  globalThis.createImageBitmap = async () => ({
    width: 1000,
    height: 500,
    close() {
      bitmapClosed = true;
    }
  });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return { drawImage() {} };
    }

    async convertToBlob() {
      return new Blob([new Uint8Array([7, 7, 7])], { type: 'image/webp' });
    }
  };

  const source = new Blob([new Uint8Array(100)], { type: 'image/avif' });
  const result = await createCoverThumbnail(source, 480);

  assert.equal(result.size, 3);
  assert.equal(bitmapClosed, true);
});

test('原生安全上限不会交给 Canvas 重试', async () => {
  let bitmapCalled = false;
  globalThis.window = {
    __TAURI__: {
      core: {
        async invoke() {
          throw new Error('NATIVE_LIMIT_EXCEEDED: 封面解码像素过多');
        }
      }
    }
  };
  globalThis.createImageBitmap = async () => {
    bitmapCalled = true;
    return { width: 100, height: 100, close() {} };
  };

  const result = await createCoverThumbnail(new Blob([new Uint8Array([1, 2, 3])], {
    type: 'image/png'
  }));
  assert.equal(result, null);
  assert.equal(bitmapCalled, false);
});

test('没有 Tauri 时继续使用 JS Canvas 兜底', async () => {
  delete globalThis.window;
  globalThis.createImageBitmap = async () => ({
    width: 120,
    height: 80,
    close() {}
  });

  const source = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  const result = await createCoverThumbnail(source, 480);
  assert.equal(result, source);
});
