/* ============================================================================
   HOMURA · 压缩包访问适配层
   ----------------------------------------------------------------------------
   统一 JSZip 与 Android 原生 ZipFile 的读取方式。格式解析、清洗和分页仍由
   JS 负责，这里只收发文本与图片 Blob，避免调用方到处判断存储后端。
   ========================================================================== */

import {
  ensureNativeArchiveSession,
  readNativePageBlob,
  readNativeTextBatch
} from './nativeArchive.js';

export function hasArchiveSource(book) {
  return !!(book?.zipContent || book?.nativeArchiveId != null);
}

export async function readArchiveText(book, paths) {
  const requested = Array.isArray(paths) ? paths : [];
  if (requested.length === 0) return [];

  if (book?.nativeArchiveId != null) {
    await ensureNativeArchiveSession(book);
    const entries = await readNativeTextBatch(book.nativeArchiveId, requested);
    const byPath = new Map(entries.map(entry => [entry.path, entry.text]));
    return requested.map(path => byPath.has(path) ? byPath.get(path) : null);
  }

  if (book?.zipContent) {
    const texts = [];
    for (const path of requested) {
      const entry = book.zipContent.file(path);
      if (!entry) {
        texts.push(null);
        continue;
      }
      try {
        texts.push(await entry.async('text'));
      } catch (err) {
        texts.push(null);
      }
    }
    return texts;
  }

  return requested.map(() => null);
}

export async function readArchiveBlobByPath(book, path) {
  if (!book || !path) return null;

  if (book.nativeArchiveId != null) {
    await ensureNativeArchiveSession(book);
    const index = book.nativeEntryIndexByPath instanceof Map
      ? book.nativeEntryIndexByPath.get(path)
      : null;
    if (!Number.isInteger(index)) return null;
    const page = await readNativePageBlob(book.nativeArchiveId, index);
    return page.blob;
  }

  const entry = book.zipContent?.file(path);
  if (!entry) return null;
  return entry.async('blob');
}

export async function readArchivePageBlob(pageObj) {
  if (!pageObj) return null;

  if (pageObj.nativeArchiveId != null) {
    if (!Number.isInteger(pageObj.nativeIndex)) return null;
    const page = await readNativePageBlob(pageObj.nativeArchiveId, pageObj.nativeIndex);
    return page.blob;
  }

  if (pageObj.zipEntry) return pageObj.zipEntry.async('blob');
  return null;
}
