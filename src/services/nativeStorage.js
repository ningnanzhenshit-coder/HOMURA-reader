/* ============================================================================
   HOMURA · Android 原生文件存档
   ----------------------------------------------------------------------------
   Android WebView 的 IndexedDB Blob / OPFS 在部分机型上无法跨进程可靠恢复。
   Tauri Android 包把原文件写进应用私有 AppData，只把相对路径存进 IndexedDB。
   ========================================================================== */

import { BaseDirectory, mkdir, readFile, remove, stat, writeFile } from '@tauri-apps/plugin-fs';
import { isAndroid } from './platform.js';
import { clearNativeArchiveBookCache, clearNativeArchiveCache } from './nativeArchive.js';

const ROOT_DIR = 'homura-native-sources';
const BASE_DIR = BaseDirectory.AppData;

export function canUseNativeStorage() {
  return isAndroid
    && typeof window !== 'undefined'
    && !!window.__TAURI__;
}

function safeSegment(name) {
  return String(name || 'source').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160) || 'source';
}

function dirname(path) {
  const index = path.lastIndexOf('/');
  return index > 0 ? path.slice(0, index) : ROOT_DIR;
}

export function nativeFilePath(bookId, relativePath) {
  const bookDir = safeSegment(bookId);
  const segments = String(relativePath || 'source')
    .split('/')
    .filter(Boolean)
    .map(safeSegment);
  return [ROOT_DIR, bookDir, ...segments].join('/');
}

export async function putNativeFile(path, blob) {
  if (!canUseNativeStorage()) throw new Error('原生文件存档不可用');
  if (!(blob instanceof Blob)) throw new Error('原文件不是 Blob');

  await mkdir(dirname(path), { baseDir: BASE_DIR, recursive: true });
  // 用流分块写，避免把整本漫画一次性序列化成巨大的 IPC 字节数组。
  await writeFile(path, blob.stream(), { baseDir: BASE_DIR });
  const info = await stat(path, { baseDir: BASE_DIR });
  if (info.size !== blob.size) {
    await remove(path, { baseDir: BASE_DIR }).catch(() => {});
    throw new Error(`原生存档回读大小不一致：${info.size} / ${blob.size}`);
  }
  return path;
}

export async function getNativeFile(path) {
  const bytes = await readFile(path, { baseDir: BASE_DIR });
  return new Blob([bytes]);
}

export async function removeNativeFile(path) {
  await remove(path, { baseDir: BASE_DIR }).catch(() => {});
}

export async function removeNativeBookDir(bookId) {
  if (!canUseNativeStorage() || !bookId) return;
  await clearNativeArchiveBookCache(bookId).catch(() => {});
  await remove(`${ROOT_DIR}/${safeSegment(bookId)}`, {
    baseDir: BASE_DIR,
    recursive: true
  }).catch(() => {});
}

export async function clearNativeSources() {
  if (!canUseNativeStorage()) return;
  await clearNativeArchiveCache().catch(() => {});
  await remove(ROOT_DIR, { baseDir: BASE_DIR, recursive: true }).catch(() => {});
}
