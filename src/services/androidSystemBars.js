/* ============================================================================
   HOMURA · Android 系统栏外观
   ----------------------------------------------------------------------------
   Tauri 的 setTheme 只负责桌面窗口标题栏；Android 状态栏 / 导航栏需要单独
   切换图标明暗，否则夜间模式会在深色底上继续显示黑色系统图标。
   ========================================================================== */

import { isAndroid } from './platform.js';

const SET_APPEARANCE_COMMAND = 'plugin:android-system-bars|setAppearance';
let lastDark = null;

export function applyAndroidSystemBars(dark) {
  if (!isAndroid) return;

  const core = window.__TAURI__ && window.__TAURI__.core;
  if (!core || typeof core.invoke !== 'function') return;

  const nextDark = !!dark;
  if (nextDark === lastDark) return;
  lastDark = nextDark;

  core.invoke(SET_APPEARANCE_COMMAND, { dark: nextDark }).catch(err => {
    // 原生插件不可用时保留下次切换重试的机会，不影响 Web 端主题切换。
    lastDark = null;
    console.warn('[HOMURA] 同步 Android 系统栏外观失败', err);
  });
}
