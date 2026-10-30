/* ============================================================================
   HOMURA · 阅读器界面状态
   ----------------------------------------------------------------------------
   顶部/底部工具栏的自动隐藏、设置抽屉与目录抽屉的开关。
   ========================================================================== */

import { defineStore } from 'pinia';
import { ref } from 'vue';

const AUTO_HIDE_DELAY = 2200;

export const useUiStore = defineStore('ui', () => {
  const readerChromeVisible = ref(true);
  const settingsOpen = ref(false);
  const tocOpen = ref(false);
  const fullscreen = ref(false);
  let hideTimer = null;
  let fullscreenBusy = false;

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  // 唤出工具栏：立即显示，并重新计时
  function showChrome() {
    readerChromeVisible.value = true;
    clearHideTimer();
    if (!settingsOpen.value && !tocOpen.value) {
      hideTimer = setTimeout(() => {
        readerChromeVisible.value = false;
        hideTimer = null;
      }, AUTO_HIDE_DELAY);
    }
  }

  function hideChrome() {
    clearHideTimer();
    if (!settingsOpen.value && !tocOpen.value) readerChromeVisible.value = false;
  }

  function toggleChrome() {
    if (readerChromeVisible.value) hideChrome();
    else showChrome();
  }

  function openSettings() {
    settingsOpen.value = true;
    tocOpen.value = false;
    clearHideTimer();
    readerChromeVisible.value = true;
  }

  function closeSettings() {
    settingsOpen.value = false;
    showChrome();
  }

  function openToc() {
    tocOpen.value = true;
    settingsOpen.value = false;
    clearHideTimer();
    readerChromeVisible.value = true;
  }

  function closeToc() {
    tocOpen.value = false;
    showChrome();
  }

  // 打开/关闭书籍时复位，避免抽屉状态残留到下一本
  function resetReaderUi() {
    clearHideTimer();
    settingsOpen.value = false;
    tocOpen.value = false;
    readerChromeVisible.value = true;
  }

  // 全屏：Tauri 下走原生窗口全屏（WebView2 不接管网页全屏），浏览器调试环境回退 Fullscreen API
  async function toggleFullscreen() {
    const tauriWindow = window.__TAURI__ && window.__TAURI__.window;
    if (tauriWindow && typeof tauriWindow.getCurrentWindow === 'function') {
      if (fullscreenBusy) return;
      fullscreenBusy = true;
      try {
        const win = tauriWindow.getCurrentWindow();
        const next = !(await win.isFullscreen());
        await win.setFullscreen(next);
        fullscreen.value = next;
      } catch (err) {
        console.warn('[HOMURA] 切换全屏失败', err);
      } finally {
        fullscreenBusy = false;
      }
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      await document.documentElement.requestFullscreen().catch(() => {});
    }
    fullscreen.value = !!document.fullscreenElement;
  }

  // 浏览器内 Esc 退出全屏时同步图标状态
  document.addEventListener('fullscreenchange', () => {
    fullscreen.value = !!document.fullscreenElement;
  });

  return {
    readerChromeVisible,
    settingsOpen,
    tocOpen,
    fullscreen,
    showChrome,
    hideChrome,
    toggleChrome,
    openSettings,
    closeSettings,
    openToc,
    closeToc,
    resetReaderUi,
    toggleFullscreen
  };
});
