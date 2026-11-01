/* ============================================================================
   HOMURA · 外部链接
   ----------------------------------------------------------------------------
   Tauri WebView 内的普通新窗口导航不可靠。桌面与 Android 包统一交给 opener
   插件调用系统浏览器；浏览器调试环境回退到带 noopener 的新标签页。
   ========================================================================== */

import { openUrl } from '@tauri-apps/plugin-opener';

function isAllowedGithubUrl(value) {
  try {
    const url = new URL(value);
    const repositoryPath = '/ningnanzhenshit-coder/HOMURA-reader';
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && (url.pathname === repositoryPath || url.pathname.startsWith(`${repositoryPath}/`));
  } catch (error) {
    return false;
  }
}

export async function openGitHubUrl(value) {
  if (!isAllowedGithubUrl(value)) throw new Error('拒绝打开非 HOMURA GitHub 地址');

  if (typeof window !== 'undefined' && window.__TAURI__) {
    await openUrl(value);
    return;
  }

  const link = document.createElement('a');
  link.href = value;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
}
