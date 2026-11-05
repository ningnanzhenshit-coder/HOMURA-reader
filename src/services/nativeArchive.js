/* ============================================================================
   HOMURA · 原生压缩包通道
   ----------------------------------------------------------------------------
   处理 Android WebView 上最费内存的 CBZ/ZIP 与 EPUB 文档：Kotlin 通过
   ZipFile 随机读取条目；桌面端由 Rust 从 AppData 读取 ZIP 中央目录。
   图片写入有上限的页面缓存，文本批量返回给 JS。原生通道不可用或允许恢复
   的普通失败可以回退 JSZip，安全限制与超限错误必须原样抛出。
   ========================================================================== */

import { isAndroid } from './platform.js';
import {
  NativeErrorCode,
  canUseNativeBridge,
  invokeNativeCommand,
  normalizeNativeError
} from './nativeRuntime.js';

const openArchives = new Set();
const lifecycleQueues = new Map();
const ensureTasks = new Map();

export function canUseNativeArchive() {
  return canUseNativeBridge();
}

async function invokeNative(command, args) {
  return invokeNativeCommand(isAndroid ? 'android-archive' : null, command, args, {
    feature: 'archive'
  });
}

// 只有普通后端失败和“能力不存在 / 格式暂不支持”允许改走 JSZip。
// 路径越界、条目过多、解压过大等限制必须由原生后端终止本次解析。
const ARCHIVE_FALLBACK_CODES = new Set([
  NativeErrorCode.UNAVAILABLE,
  NativeErrorCode.UNSUPPORTED,
  NativeErrorCode.DISABLED,
  NativeErrorCode.COMMAND_FAILED,
  NativeErrorCode.INVALID_DATA
]);

export function shouldFallbackNativeArchive(error) {
  const normalized = normalizeNativeError(error, { feature: 'archive' });
  return ARCHIVE_FALLBACK_CODES.has(normalized.code);
}

// open / close 必须按压缩包串行，避免快速切书时 close 晚于下一轮 open 执行。
function enqueueLifecycle(archiveId, operation) {
  const previous = lifecycleQueues.get(archiveId) || Promise.resolve();
  const task = previous.catch(() => {}).then(operation);
  lifecycleQueues.set(archiveId, task);
  task.then(
    () => {
      if (lifecycleQueues.get(archiveId) === task) lifecycleQueues.delete(archiveId);
    },
    () => {
      if (lifecycleQueues.get(archiveId) === task) lifecycleQueues.delete(archiveId);
    }
  );
  return task;
}

function nativeArchiveIdFor(book) {
  return book?.nativeArchiveId
    || (book?.pageItems || []).find(item => item?.nativeArchiveId)?.nativeArchiveId
    || null;
}

function nativeArchivePathFor(book) {
  return book?.nativeArchivePath
    || (book?.pageItems || []).find(item => item?.nativeArchivePath)?.nativeArchivePath
    || '';
}

function nativeArchiveModeFor(book) {
  return book?.nativeArchiveMode
    || (book?.pageItems || []).find(item => item?.nativeArchiveMode)?.nativeArchiveMode
    || 'pages';
}

export function openNativeArchive(archiveId, path) {
  return enqueueLifecycle(archiveId, async () => {
    const result = await invokeNative('open', { archiveId, path });
    openArchives.add(archiveId);
    return result;
  });
}

export function openNativeDocument(archiveId, path) {
  return enqueueLifecycle(archiveId, async () => {
    const result = await invokeNative('openDocument', { archiveId, path });
    openArchives.add(archiveId);
    return result;
  });
}

export function extractNativePage(archiveId, index) {
  return invokeNative('extract', { archiveId, index });
}

export function extractNativeEntry(archiveId, index) {
  return extractNativePage(archiveId, index);
}

export async function readNativeTextBatch(archiveId, paths) {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  if (!openArchives.has(archiveId)) throw new Error('原生压缩包会话尚未打开');
  const result = await invokeNative('readTextBatch', {
    archiveId,
    pathsJson: JSON.stringify(paths)
  });
  return Array.isArray(result?.texts) ? result.texts : [];
}

export function closeNativeArchive(archiveId) {
  // 立即从可用集合移除；真正的 close 与后续 open 由同一条队列排序。
  openArchives.delete(archiveId);
  return enqueueLifecycle(archiveId, async () => {
    try {
      return await invokeNative('close', { archiveId });
    } finally {
      openArchives.delete(archiveId);
    }
  });
}

export function clearNativeArchiveBookCache(bookId) {
  openArchives.delete(bookId);
  ensureTasks.delete(bookId);
  return enqueueLifecycle(bookId, () => invokeNative('clearBook', { bookId }));
}

export async function clearNativeArchiveCache() {
  try {
    return await invokeNative('clearAll');
  } finally {
    openArchives.clear();
    ensureTasks.clear();
  }
}

export function isNativeArchiveSessionOpen(archiveId) {
  return !!archiveId && openArchives.has(archiveId);
}

// 关闭阅读器后页面项仍然保留，重新打开时按需恢复 ZipFile 句柄。
export function ensureNativeArchiveSession(book) {
  const archiveId = nativeArchiveIdFor(book);
  if (!archiveId) return Promise.resolve(false);
  if (openArchives.has(archiveId)) return Promise.resolve(true);
  if (ensureTasks.has(archiveId)) return ensureTasks.get(archiveId);

  const path = nativeArchivePathFor(book);
  if (!path) return Promise.reject(new Error('原生压缩包路径缺失'));

  const openTask = nativeArchiveModeFor(book) === 'document'
    ? openNativeDocument(archiveId, path)
    : openNativeArchive(archiveId, path);
  const task = openTask
    .then(() => true)
    .finally(() => {
      if (ensureTasks.get(archiveId) === task) ensureTasks.delete(archiveId);
    });
  ensureTasks.set(archiveId, task);
  return task;
}

// 只释放 ZipFile 句柄，保留已解压的页面缓存，方便快速重开同一本书。
export function releaseNativeArchiveSession(book) {
  const archiveId = nativeArchiveIdFor(book);
  if (!archiveId) return Promise.resolve();
  return closeNativeArchive(archiveId).catch(() => {});
}

// 缓存文件位于 AppCache；读取路径由 plugin-fs 的 appcache 递归读权限覆盖。
export async function ensureNativePageAsset(archiveId, index) {
  if (!Number.isInteger(index)) return null;
  const file = await extractNativePage(archiveId, index);
  if (!file?.path) return null;
  const convertFileSrc = typeof window !== 'undefined'
    ? window.__TAURI__?.core?.convertFileSrc
    : null;
  if (typeof convertFileSrc !== 'function') return null;
  return {
    url: convertFileSrc(file.path),
    width: file.width || 0,
    height: file.height || 0,
    mime: file.mime || 'image/webp'
  };
}

export async function readNativePageBlob(archiveId, index) {
  const file = await extractNativePage(archiveId, index);
  if (!file?.path) throw new Error('原生页面缓存路径为空');
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const bytes = await readFile(file.path);
  return {
    path: file.path,
    mime: file.mime || 'image/jpeg',
    size: file.size,
    blob: new Blob([bytes], { type: file.mime || 'image/jpeg' })
  };
}
