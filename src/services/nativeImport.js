/* ============================================================================
   HOMURA · 桌面原生导入
   ----------------------------------------------------------------------------
   桌面 Tauri 用系统选择器拿真实路径，再交给 Rust 直接复制到 AppData。
   EPUB / CBZ 全程不经过 WebView Blob；其它格式只在解析时按需读成 File。
   ========================================================================== */

import { readFile } from '@tauri-apps/plugin-fs';
import { getNativeFile } from './nativeStorage.js';
import {
  NativeErrorCode,
  canUseNativeBridge,
  invokeNativeCommand,
  normalizeNativeError
} from './nativeRuntime.js';
import { isAndroid } from './platform.js';

const IMPORT_FILTER_EXTENSIONS = [
  'epub',
  'pdf',
  'mobi',
  'prc',
  'azw',
  'cbz',
  'zip',
  'txt',
  'md',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'avif',
  'bmp'
];

const MIME_BY_EXTENSION = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  mobi: 'application/x-mobipocket-ebook',
  prc: 'application/x-mobipocket-ebook',
  azw: 'application/vnd.amazon.ebook',
  cbz: 'application/vnd.comicbook+zip',
  zip: 'application/zip',
  txt: 'text/plain',
  md: 'text/markdown',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp'
};

const NATIVE_IMPORT_FALLBACK_CODES = new Set([
  NativeErrorCode.UNAVAILABLE,
  NativeErrorCode.UNSUPPORTED,
  NativeErrorCode.DISABLED,
  NativeErrorCode.COMMAND_FAILED,
  NativeErrorCode.INVALID_DATA
]);

export function canUseNativeImport() {
  return canUseNativeBridge() && !isAndroid;
}

export function nativeImportMime(name) {
  const extension = String(name || '').split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXTENSION[extension] || '';
}

function withRelativePath(file, relativePath) {
  if (!relativePath) return file;
  try {
    Object.defineProperty(file, 'customRelativePath', {
      value: relativePath,
      writable: false
    });
  } catch (err) {
    file.customRelativePath = relativePath;
  }
  return file;
}

export function makeNativeImportFile(entry) {
  const file = {
    name: entry.name,
    size: entry.size || 0,
    lastModified: entry.modifiedMs || Date.now(),
    type: nativeImportMime(entry.name),
    nativePath: entry.path
  };
  return withRelativePath(file, entry.relativePath);
}

export function isNativeImportFile(file) {
  return !!file?.nativePath && !(typeof Blob !== 'undefined' && file instanceof Blob);
}

export function shouldFallbackNativeImport(error) {
  const normalized = normalizeNativeError(error, { feature: 'native-import' });
  return NATIVE_IMPORT_FALLBACK_CODES.has(normalized.code);
}

function fileFromBytes(bytes, file) {
  try {
    return withRelativePath(new File([bytes], file.name, {
      type: file.type || nativeImportMime(file.name),
      lastModified: file.lastModified || Date.now()
    }), file.customRelativePath);
  } catch (err) {
    const blob = new Blob([bytes], { type: file.type || nativeImportMime(file.name) });
    try {
      Object.defineProperty(blob, 'name', { value: file.name, writable: false });
      Object.defineProperty(blob, 'lastModified', {
        value: file.lastModified || Date.now(),
        writable: false
      });
    } catch (defineError) {}
    return withRelativePath(blob, file.customRelativePath);
  }
}

export async function materializeNativeImportFile(file) {
  if (!isNativeImportFile(file)) return file;
  const bytes = await readFile(file.nativePath);
  return fileFromBytes(bytes, file);
}

export async function materializeStagedNativeImportFile(file, nativePath) {
  const blob = await getNativeFile(nativePath);
  return fileFromBytes(blob, file);
}

export async function pickNativeImportPaths({ directory = false, multiple = false, title = '导入作品' } = {}) {
  const result = await invokeNativeCommand('dialog', 'open', {
    options: {
      title,
      directory,
      multiple,
      recursive: directory,
      filters: directory
        ? []
        : [{ name: '书籍与漫画', extensions: IMPORT_FILTER_EXTENSIONS }]
    }
  }, {
    feature: 'native-import-dialog'
  });
  if (result === null || result === undefined) return null;
  const paths = Array.isArray(result) ? result : [result];
  return paths
    .map(entry => typeof entry === 'string' ? entry : entry?.path)
    .filter(path => typeof path === 'string' && path.length > 0);
}

export async function scanNativeImportPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const result = await invokeNativeCommand(null, 'scanImportPaths', { paths }, {
    feature: 'native-import'
  });
  return Array.isArray(result?.files) ? result.files : [];
}

export async function stageNativeImportPath(bookId, sourcePath) {
  return invokeNativeCommand(null, 'stageImportPath', {
    bookId,
    sourcePath
  }, {
    feature: 'native-import'
  });
}
