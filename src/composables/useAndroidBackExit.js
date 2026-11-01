/* ============================================================================
   HOMURA · Android 主页返回退出
   ----------------------------------------------------------------------------
   主页第一次按返回只提示，短时间内再按一次才退出；
   阅读器打开时交给 useShortcuts 处理，避免两条返回链路重叠。
   ========================================================================== */

import { onMounted, onBeforeUnmount, watch } from 'vue';
import { isAndroid } from '../services/platform.js';

const EXIT_CONFIRM_WINDOW = 2000;
const EXIT_TOAST_TEXT = '再按一次退出';

export function useAndroidBackExit(reader, dismissOverlay) {
  let backListener = null;
  let backListenerToken = 0;
  let lastBackAt = 0;
  let exitRequested = false;

  function unregisterBackListener(listener) {
    if (typeof listener === 'function') return listener();
    if (listener && typeof listener.unregister === 'function') return listener.unregister();
  }

  async function showExitToast() {
    const core = window.__TAURI__ && window.__TAURI__.core;
    if (!core || typeof core.invoke !== 'function') return;

    try {
      await core.invoke('plugin:android-toast|show', { message: EXIT_TOAST_TEXT });
    } catch (err) {
      console.warn('[HOMURA] 显示 Android 退出提示失败', err);
    }
  }

  async function exitApp() {
    if (exitRequested) return;
    exitRequested = true;

    const app = window.__TAURI__ && window.__TAURI__.app;
    try {
      if (!app || typeof app.exit !== 'function') throw new Error('Tauri app.exit 不可用');
      await app.exit(0);
    } catch (err) {
      exitRequested = false;
      console.warn('[HOMURA] Android 退出失败', err);
    }
  }

  function onBackButtonPress() {
    if (reader.currentBook) return;
    if (dismissOverlay && dismissOverlay()) {
      lastBackAt = 0;
      return;
    }

    const now = Date.now();
    if (now - lastBackAt <= EXIT_CONFIRM_WINDOW) {
      lastBackAt = 0;
      exitApp();
      return;
    }

    lastBackAt = now;
    showExitToast();
  }

  async function enableBackListener() {
    if (!isAndroid || backListener || reader.currentBook) return;

    const token = ++backListenerToken;
    const app = window.__TAURI__ && window.__TAURI__.app;
    if (!app || typeof app.onBackButtonPress !== 'function') return;

    try {
      const listener = await app.onBackButtonPress(onBackButtonPress);
      if (token !== backListenerToken || reader.currentBook) {
        await unregisterBackListener(listener);
        return;
      }
      backListener = listener;
    } catch (err) {
      console.warn('[HOMURA] 注册 Android 主页返回监听失败', err);
    }
  }

  function disableBackListener() {
    backListenerToken++;
    lastBackAt = 0;
    if (!backListener) return;

    const listener = backListener;
    backListener = null;
    Promise.resolve(unregisterBackListener(listener)).catch(err => {
      console.warn('[HOMURA] 注销 Android 主页返回监听失败', err);
    });
  }

  const stopBackWatch = watch(
    () => reader.currentBook,
    book => {
      if (book) disableBackListener();
      else enableBackListener();
    }
  );

  onMounted(enableBackListener);

  onBeforeUnmount(() => {
    stopBackWatch();
    disableBackListener();
  });
}
