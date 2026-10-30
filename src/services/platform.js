/* ============================================================================
   HOMURA · 平台能力探测
   ----------------------------------------------------------------------------
   导入与本地存档依赖若干浏览器能力，桌面与移动端差异很大：
   - File System Access API：桌面 Chromium / Tauri(WebView2) 可用，iOS Safari、
     Android Chrome 均不可用。
   - 文件夹选择：桌面 Chromium 走 showDirectoryPicker；Android Chrome 仅支持
     <input webkitdirectory>；iOS Safari 两者都不支持。
   - 拖拽导入：只有精确指针（鼠标/触控板）才有意义，触屏设备忽略。
   - OPFS：大文件原样落盘，避免 IndexedDB Blob 爆配额。
   ========================================================================== */

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

// iPadOS 13+ 默认伪装成 Macintosh 的桌面 UA，用触点数量补齐识别
export const isIOS = /iPad|iPhone|iPod/.test(ua)
  || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);

export const isAndroid = /Android/i.test(ua);

export const hasFileSystemAccess = typeof window !== 'undefined'
  && typeof window.showOpenFilePicker === 'function';

export const hasDirectoryPicker = typeof window !== 'undefined'
  && typeof window.showDirectoryPicker === 'function';

export const supportsDirectoryInput = typeof document !== 'undefined'
  && 'webkitdirectory' in document.createElement('input');

// 能否选择整个文件夹：桌面走 FSA / 目录 input。
// Android 的系统文件选择器只接受文件，WebView 里即使原型上有 webkitdirectory 也选不到目录，
// 因此安卓直接不提供文件夹入口，改用多选文件导入。
export const canPickFolder = !isAndroid && (hasDirectoryPicker || supportsDirectoryInput);

// 拖拽只在精确指针设备上开启，触屏下拉文件没有实际入口
export const canDragImport = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
  : true;

export const canUseOPFS = typeof navigator !== 'undefined'
  && !!navigator.storage
  && typeof navigator.storage.getDirectory === 'function';

// iOS 不接受未知扩展名的 accept 过滤，会直接置灰文件；这里干脆不做扩展名限制
export const fileAccept = isIOS ? '' : '.epub,.pdf,.mobi,.prc,.azw,.cbz,.zip,.txt,.md,image/*';

export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  const digits = value >= 100 || idx === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[idx]}`;
}
