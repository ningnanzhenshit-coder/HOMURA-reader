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
  let hideTimer = null;

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

  return {
    readerChromeVisible,
    settingsOpen,
    tocOpen,
    showChrome,
    hideChrome,
    toggleChrome,
    openSettings,
    closeSettings,
    openToc,
    closeToc,
    resetReaderUi
  };
});
