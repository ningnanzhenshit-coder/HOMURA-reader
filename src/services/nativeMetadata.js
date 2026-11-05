/* ============================================================================
   HOMURA · 原生元数据后端
   ----------------------------------------------------------------------------
   桌面与 Android 的 Tauri 包把书目、书库与阅读进度镜像到 SQLite；封面仍以
   Blob 形式随记录一起写入。IndexedDB 始终是完整兜底，这里只负责数据形状
   转换与原生命令调用，不决定何时回退。
   ========================================================================== */

import {
  NativeBridgeError,
  NativeErrorCode,
  bytesToBase64,
  canUseNativeBridge,
  invokeNativeCommand,
  isNativeFeatureAvailable
} from './nativeRuntime.js';

const FEATURE = 'metadata';
const MAX_COVER_BYTES = 24 * 1024 * 1024;

function invalidResponse(message) {
  return new NativeBridgeError(NativeErrorCode.INVALID_DATA, message, { feature: FEATURE });
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw invalidResponse(`原生元数据缺少 ${label}`);
  return value;
}

export function canUseNativeMetadata() {
  return canUseNativeBridge() && isNativeFeatureAvailable(FEATURE);
}

async function blobToBase64(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function' || typeof blob.size !== 'number') return null;
  if (blob.size > MAX_COVER_BYTES) {
    throw new NativeBridgeError(
      NativeErrorCode.LIMIT_EXCEEDED,
      '封面数据过大，未写入 SQLite',
      { feature: FEATURE, command: 'metadata' }
    );
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const encoded = bytesToBase64(bytes);
  if (encoded === null) throw invalidResponse('当前环境无法编码封面数据');
  return encoded;
}

function base64ToBlob(value, mime) {
  if (typeof value !== 'string' || !value) return null;
  let binary;
  try {
    binary = atob(value);
  } catch (err) {
    throw invalidResponse('SQLite 中的封面数据不是有效 Base64');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime || '' });
}

function normalizeBook(record) {
  if (!record || typeof record.id !== 'string') throw invalidResponse('SQLite 中存在无效书目');
  return {
    id: record.id,
    type: record.type || 'novel',
    format: record.format || null,
    title: record.title || '',
    favorite: !!record.favorite,
    pageCount: Number(record.pageCount) || 0,
    addedAt: Number(record.addedAt) || 0,
    coverBlob: base64ToBlob(record.coverBase64, record.coverMime),
    customCoverBlob: base64ToBlob(record.customCoverBase64, record.customCoverMime)
  };
}

function normalizeCollection(record) {
  if (!record || typeof record.id !== 'string') throw invalidResponse('SQLite 中存在无效书库');
  return {
    id: record.id,
    title: String(record.title || ''),
    createdAt: Number(record.createdAt) || 0,
    bookIds: Array.isArray(record.bookIds) ? record.bookIds.filter(id => typeof id === 'string') : []
  };
}

async function serializeBook(book) {
  return {
    id: String(book.id || ''),
    type: String(book.type || 'novel'),
    format: book.format || null,
    title: String(book.title || ''),
    favorite: !!book.favorite,
    pageCount: Number(book.pageCount) || 0,
    addedAt: Number(book.addedAt) || 0,
    coverBase64: await blobToBase64(book.coverBlob),
    coverMime: book.coverBlob?.type || null,
    customCoverBase64: await blobToBase64(book.customCoverBlob),
    customCoverMime: book.customCoverBlob?.type || null
  };
}

async function serializeSnapshot(snapshot) {
  const books = [];
  for (const book of snapshot.books || []) {
    books.push(await serializeBook(book));
  }
  return {
    books,
    collections: (snapshot.collections || []).map(item => ({
      id: item.id,
      title: item.title,
      createdAt: Number(item.createdAt) || 0,
      bookIds: Array.isArray(item.bookIds) ? item.bookIds : []
    })),
    progress: snapshot.progress || []
  };
}

export async function loadNativeMetadata() {
  const result = await invokeNativeCommand(null, 'metadata_load', {}, { feature: FEATURE });
  if (!result || typeof result !== 'object') throw invalidResponse('原生元数据响应无效');
  return {
    initialized: !!result.initialized,
    books: requireArray(result.books, '书目').map(normalizeBook),
    collections: requireArray(result.collections, '书库').map(normalizeCollection),
    progress: requireArray(result.progress, '阅读进度')
  };
}

export async function replaceNativeMetadata(snapshot) {
  const payload = await serializeSnapshot(snapshot);
  await invokeNativeCommand(null, 'metadata_replace_all', { snapshot: payload }, { feature: FEATURE });
}

export async function upsertNativeBook(book) {
  await invokeNativeCommand(
    null,
    'metadata_upsert_book',
    { book: await serializeBook(book) },
    { feature: FEATURE }
  );
}

export async function saveNativeCollections(collections) {
  await invokeNativeCommand(
    null,
    'metadata_save_collections',
    {
      collections: (collections || []).map(item => ({
        id: item.id,
        title: item.title,
        createdAt: Number(item.createdAt) || 0,
        bookIds: Array.isArray(item.bookIds) ? item.bookIds : []
      }))
    },
    { feature: FEATURE }
  );
}

export async function saveNativeProgress(record) {
  await invokeNativeCommand(null, 'metadata_save_progress', { record }, { feature: FEATURE });
}

export async function deleteNativeBook(bookId) {
  await invokeNativeCommand(null, 'metadata_delete_book', { bookId }, { feature: FEATURE });
}

export async function clearNativeProgress() {
  await invokeNativeCommand(null, 'metadata_clear_progress', {}, { feature: FEATURE });
}

export async function clearNativeMetadata() {
  await invokeNativeCommand(null, 'metadata_clear_all', {}, { feature: FEATURE });
}
