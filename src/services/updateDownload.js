/* ============================================================================
   HOMURA · 应用内更新下载
   ----------------------------------------------------------------------------
   下载由 Rust 命令流式写入应用缓存，进度通过 Tauri 事件回传。
   浏览器调试环境没有原生命令，调用方应回退到 GitHub Releases 页面。
   ========================================================================== */

import { isAndroid } from './platform.js';

const PROGRESS_EVENT = 'update-download-progress';
const PENDING_UPDATE_KEY = 'homura_pending_update_v1';

function getTauriBridge() {
  if (typeof window === 'undefined') return null;
  const bridge = window.__TAURI__;
  if (!bridge || !bridge.core || typeof bridge.core.invoke !== 'function') return null;
  return bridge;
}

export function canDownloadUpdateInApp() {
  return !!getTauriBridge();
}

export function loadPendingUpdate() {
  if (typeof localStorage === 'undefined') return null;

  try {
    const value = JSON.parse(localStorage.getItem(PENDING_UPDATE_KEY) || 'null');
    if (!value || typeof value !== 'object') return null;
    const downloadId = String(value.downloadId || '').trim();
    const path = String(value.path || '').trim();
    const version = String(value.version || '').trim();
    const fileName = String(value.fileName || '').trim();
    if (!downloadId || !path || !version || !fileName) return null;
    return {
      downloadId,
      path,
      version,
      fileName,
      size: Number(value.size) || 0,
      packageLabel: String(value.packageLabel || ''),
      platform: String(value.platform || '')
    };
  } catch (error) {
    console.warn('读取待安装更新记录失败', error);
    return null;
  }
}

export function savePendingUpdate(update) {
  if (typeof localStorage === 'undefined' || !update) return;
  try {
    localStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify({
      downloadId: String(update.downloadId || ''),
      path: String(update.path || ''),
      version: String(update.version || ''),
      fileName: String(update.fileName || ''),
      size: Number(update.size) || 0,
      packageLabel: String(update.packageLabel || ''),
      platform: String(update.platform || '')
    }));
  } catch (error) {
    console.warn('保存待安装更新记录失败', error);
  }
}

export function clearPendingUpdate() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_UPDATE_KEY);
  } catch (error) {
    console.warn('清理待安装更新记录失败', error);
  }
}

function normalizeDownloadError(error) {
  if (error && typeof error === 'object') {
    return {
      code: String(error.code || 'DOWNLOAD_FAILED'),
      message: String(error.message || error.detail || '下载更新失败。')
    };
  }
  const message = String(error || '下载更新失败。');
  return { code: message === 'cancelled' ? 'CANCELLED' : 'DOWNLOAD_FAILED', message };
}

export function getDownloadErrorMessage(error) {
  const normalized = normalizeDownloadError(error);
  if (normalized.code === 'CANCELLED') return '下载已取消。';
  if (normalized.code === 'DOWNLOAD_IN_PROGRESS') return '已有更新正在下载，请稍候。';
  if (normalized.code === 'NETWORK') return '网络连接中断，请检查网络后重试。';
  if (normalized.code === 'CHECKSUM_MISMATCH') return '安装包大小与 Release 信息不一致，已停止下载。';
  if (normalized.code === 'INSTALL_FAILED') return normalized.message || '无法启动系统安装程序。';
  return normalized.message || '下载更新失败，请稍后重试。';
}

export async function downloadUpdateAsset({
  downloadId,
  url,
  fileName,
  expectedSize,
  onProgress
}) {
  const bridge = getTauriBridge();
  if (!bridge) throw new Error('当前环境不支持应用内下载。');

  let unlisten = null;
  if (bridge.event && typeof bridge.event.listen === 'function') {
    unlisten = await bridge.event.listen(PROGRESS_EVENT, event => {
      const payload = event && event.payload;
      if (!payload || payload.downloadId !== downloadId) return;
      if (typeof onProgress === 'function') onProgress(payload);
    });
  }

  try {
    return await bridge.core.invoke('download_update_asset', {
      downloadId,
      url,
      fileName,
      expectedSize: Number(expectedSize) || null
    });
  } catch (error) {
    throw normalizeDownloadError(error);
  } finally {
    if (typeof unlisten === 'function') unlisten();
  }
}

export async function cancelUpdateDownload(downloadId) {
  const bridge = getTauriBridge();
  if (!bridge || !downloadId) return false;
  return bridge.core.invoke('cancel_update_download', { downloadId });
}

export async function installDownloadedUpdate({ downloadId, path }) {
  const bridge = getTauriBridge();
  if (!bridge) throw new Error('当前环境不支持应用内安装。');

  if (isAndroid) {
    return bridge.core.invoke('plugin:android-installer|install', { path });
  }
  return bridge.core.invoke('open_update_file', { downloadId, path });
}
