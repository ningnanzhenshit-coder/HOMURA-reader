import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  NativeBridgeError,
  NativeErrorCode,
  canUseNativeBridge,
  disableNativeFeature,
  invokeNativeCommand,
  normalizeNativeError,
  resetNativeRuntimeState,
  runNativeWithFallback
} from '../src/services/nativeRuntime.js';

const silentLogger = { warn() {} };

function installNative(invoke) {
  globalThis.window = {
    __TAURI__: {
      core: { invoke }
    }
  };
}

afterEach(() => {
  delete globalThis.window;
  resetNativeRuntimeState();
});

test('没有 Tauri 时直接走 JS 兜底', async () => {
  assert.equal(canUseNativeBridge(), false);

  await assert.rejects(
    invokeNativeCommand('android-archive', 'open', {}),
    error => error instanceof NativeBridgeError && error.code === NativeErrorCode.UNAVAILABLE
  );

  let fallbackError = null;
  const result = await runNativeWithFallback({
    feature: 'archive',
    command: 'open',
    fallback: error => {
      fallbackError = error;
      return 'js-result';
    },
    logger: silentLogger
  });

  assert.equal(result, 'js-result');
  assert.equal(fallbackError.code, NativeErrorCode.UNAVAILABLE);
});

test('原生命令成功时使用插件命令并跳过兜底', async () => {
  const calls = [];
  installNative(async (command, args) => {
    calls.push({ command, args });
    return { entries: [{ index: 0, path: 'page.jpg' }] };
  });

  let fallbackCalled = false;
  const result = await runNativeWithFallback({
    feature: 'archive',
    plugin: 'android-archive',
    command: 'open',
    args: { archiveId: 'book-1', path: 'book.cbz' },
    fallback: () => {
      fallbackCalled = true;
      return null;
    },
    logger: silentLogger
  });

  assert.deepEqual(result, { entries: [{ index: 0, path: 'page.jpg' }] });
  assert.deepEqual(calls, [{
    command: 'plugin:android-archive|open',
    args: { archiveId: 'book-1', path: 'book.cbz' }
  }]);
  assert.equal(fallbackCalled, false);
});

test('默认只对不可用类错误回退，解析错误保持抛出', async () => {
  installNative(async () => {
    throw new Error('压缩包解析失败');
  });

  let fallbackCalled = false;
  await assert.rejects(
    runNativeWithFallback({
      feature: 'archive',
      command: 'open',
      fallback: () => {
        fallbackCalled = true;
        return 'js-result';
      },
      logger: silentLogger
    }),
    error => error.code === NativeErrorCode.INVALID_DATA
  );
  assert.equal(fallbackCalled, false);
});

test('调用方可以显式允许解析错误回退', async () => {
  installNative(async () => {
    throw new Error('压缩包解析失败');
  });

  const result = await runNativeWithFallback({
    feature: 'archive',
    command: 'open',
    fallback: error => error.code === NativeErrorCode.INVALID_DATA ? 'js-result' : null,
    fallbackOn: [NativeErrorCode.INVALID_DATA],
    logger: silentLogger
  });

  assert.equal(result, 'js-result');
});

test('安全限制与大小限制错误永远不会回退', async () => {
  for (const message of [
    '压缩包路径不在 HOMURA 存档目录内',
    '压缩包图片数量过多'
  ]) {
    installNative(async () => {
      throw new Error(message);
    });

    let fallbackCalled = false;
    await assert.rejects(
      runNativeWithFallback({
        feature: 'archive',
        command: 'open',
        fallback: () => {
          fallbackCalled = true;
          return 'js-result';
        },
        fallbackOn: Object.values(NativeErrorCode),
        logger: silentLogger
      }),
      error => [
        NativeErrorCode.SECURITY_LIMIT,
        NativeErrorCode.LIMIT_EXCEEDED
      ].includes(error.code)
    );
    assert.equal(fallbackCalled, false);
  }
});

test('已被特性的禁用状态会直接走兜底且不再调用原生', async () => {
  let nativeCalled = false;
  installNative(async () => {
    nativeCalled = true;
    return 'native-result';
  });

  disableNativeFeature('archive', '测试禁用');
  const result = await runNativeWithFallback({
    feature: 'archive',
    command: 'open',
    fallback: () => 'js-result',
    logger: silentLogger
  });

  assert.equal(result, 'js-result');
  assert.equal(nativeCalled, false);
});

test('显式错误码优先于文本猜测', () => {
  const error = normalizeNativeError({
    code: NativeErrorCode.SECURITY_LIMIT,
    message: '看起来只是一次普通失败'
  });

  assert.equal(error.code, NativeErrorCode.SECURITY_LIMIT);
  assert.equal(error.message, '看起来只是一次普通失败');
});

test('Rust 的 NATIVE_* 文本前缀会保留为精确错误码', () => {
  const error = normalizeNativeError(
    'NATIVE_LIMIT_EXCEEDED: 压缩包条目数量过多'
  );

  assert.equal(error.code, NativeErrorCode.LIMIT_EXCEEDED);
  assert.equal(error.message, 'NATIVE_LIMIT_EXCEEDED: 压缩包条目数量过多');
});
