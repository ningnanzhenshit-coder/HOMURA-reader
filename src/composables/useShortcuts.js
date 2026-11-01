/* ============================================================================
   HOMURA · 阅读器快捷键、系统返回与窗口事件
   ----------------------------------------------------------------------------
   键盘（方向键 / 空格 / Esc）、视口滚轮翻页（190ms 节流）、
   Android 系统返回、窗口尺寸变化时的小说重排。由 ReaderModal 挂载时安装。
   ========================================================================== */

import { onMounted, onBeforeUnmount, watch } from 'vue';
import { useUiStore } from '../stores/ui.js';

export function useShortcuts(reader, viewportRef, dismissWithPredictiveBack) {
  const ui = useUiStore();
  let backListener = null;
  let backListenerToken = 0;

  function unregisterBackListener(listener) {
    if (typeof listener === 'function') return listener();
    if (listener && typeof listener.unregister === 'function') return listener.unregister();
  }

  // 仅在阅读器打开时接管 Android 返回键；书架页保持系统默认的退出行为
  async function enableAndroidBackListener() {
    if (backListener) return;
    const token = ++backListenerToken;
    const app = window.__TAURI__ && window.__TAURI__.app;
    if (!reader.currentBook || !app || typeof app.onBackButtonPress !== 'function') return;

    try {
      const listener = await app.onBackButtonPress(() => {
        if (!reader.currentBook) return;
        if (ui.settingsOpen) {
          ui.closeSettings();
        } else if (ui.tocOpen) {
          ui.closeToc();
        } else {
          dismissWithPredictiveBack();
        }
      });

      // 注册是异步的：期间已关闭阅读器时必须立即注销，避免书架页吞掉返回键
      if (token !== backListenerToken || !reader.currentBook) {
        await unregisterBackListener(listener);
        return;
      }
      backListener = listener;
    } catch (err) {
      console.warn('[HOMURA] 注册 Android 返回键失败', err);
    }
  }

  function disableAndroidBackListener() {
    backListenerToken++;
    if (!backListener) return;
    const listener = backListener;
    backListener = null;
    Promise.resolve(unregisterBackListener(listener)).catch(err => {
      console.warn('[HOMURA] 注销 Android 返回键失败', err);
    });
  }

  function onKeydown(e) {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (!reader.currentBook) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      reader.onLeftButtonClick();
    } else if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      reader.onRightButtonClick();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      reader.goNextPage();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      reader.goPrevPage();
    } else if (e.key === 'Escape') {
      // 逐层退出：先关抽屉，再唤出工具栏，最后关闭阅读器
      if (ui.settingsOpen) {
        ui.closeSettings();
      } else if (ui.tocOpen) {
        ui.closeToc();
      } else if (!ui.readerChromeVisible) {
        ui.showChrome();
      } else {
        dismissWithPredictiveBack();
      }
    }
  }

  // Mouse Wheel Page Turn Support（条漫模式让位原生滚动）
  function onWheel(e) {
    if (!reader.currentBook) return;
    // 抽屉打开时滚轮属于抽屉内容，不能截成阅读器翻页
    if (ui.settingsOpen || ui.tocOpen) return;
    if (reader.layoutConfig.direction === 'vertical') return;

    e.preventDefault();
    const now = Date.now();
    if (now - reader.lastWheelTurnTime < 190) return;

    if (Math.abs(e.deltaY) > 10) {
      reader.lastWheelTurnTime = now;
      if (e.deltaY > 0) {
        reader.goNextPage();
      } else {
        reader.goPrevPage();
      }
    } else if (Math.abs(e.deltaX) > 15) {
      reader.lastWheelTurnTime = now;
      if (e.deltaX > 0) {
        reader.onRightButtonClick();
      } else {
        reader.onLeftButtonClick();
      }
    }
  }

  // 窗口尺寸变化：交给 store 判断是重排小说还是单双页档位变化后重渲染
  function onResize() {
    if (!reader.currentBook) return;
    reader.handleViewportChange();
  }

  // 移动端地址栏伸缩只触发 visualViewport resize 且抖动频繁：
  // 高度变化超过 80px 才视为真正的视口变化，避免阅读中反复重排
  let lastViewportHeight = 0;
  function onVisualViewportResize() {
    const h = window.visualViewport ? window.visualViewport.height : 0;
    if (!h) return;
    if (Math.abs(h - lastViewportHeight) < 80) return;
    lastViewportHeight = h;
    onResize();
  }

  onMounted(() => {
    enableAndroidBackListener();
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);
    if (window.visualViewport) {
      lastViewportHeight = window.visualViewport.height;
      window.visualViewport.addEventListener('resize', onVisualViewportResize);
    }
    if (viewportRef.value) {
      viewportRef.value.addEventListener('wheel', onWheel, { passive: false });
    }
  });

  const stopBackWatch = watch(
    () => reader.currentBook,
    book => {
      if (book) enableAndroidBackListener();
      else disableAndroidBackListener();
    }
  );

  onBeforeUnmount(() => {
    stopBackWatch();
    disableAndroidBackListener();
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onResize);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onVisualViewportResize);
    }
    if (viewportRef.value) {
      viewportRef.value.removeEventListener('wheel', onWheel);
    }
    clearTimeout(reader.resizeTimer);
  });
}
