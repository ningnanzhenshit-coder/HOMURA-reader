/* ============================================================================
   HOMURA · 一级书库与目录导入规划
   ========================================================================== */

import { normalizeBookTitle } from './bookTitles.js';

export function collectionNameError(title, collections, exceptId = null) {
  const name = String(title || '').trim();
  if (!name) return '请输入书库名称';
  if (name.length > 80) return '书库名称最多 80 个字符';
  if (collections.some(item => item.id !== exceptId && normalizeBookTitle(item.title) === normalizeBookTitle(name))) {
    return '已有同名书库，请换一个名称';
  }
  return '';
}

export function moveCollectionBooks(collections, bookIds, targetId) {
  if (targetId && !collections.some(item => item.id === targetId)) throw new Error('目标书库不存在');
  const ids = new Set(bookIds);
  return collections.map(item => ({
    ...item,
    bookIds: [...item.bookIds.filter(id => !ids.has(id)), ...(item.id === targetId ? ids : [])]
  }));
}

export function restoreCollections(records, books) {
  const valid = new Set(books.map(book => book.id));
  const assigned = new Set();
  const collectionIds = new Set();
  const restored = [];
  for (const item of records) {
    if (!item || typeof item.id !== 'string' || collectionIds.has(item.id)) continue;
    collectionIds.add(item.id);
    const bookIds = [];
    for (const id of Array.isArray(item.bookIds) ? item.bookIds : []) {
      if (!valid.has(id) || assigned.has(id)) continue;
      assigned.add(id);
      bookIds.push(id);
    }
    restored.push({ id: item.id, title: String(item.title || '未命名书库'), createdAt: Number(item.createdAt) || 0, bookIds });
  }
  return restored;
}

export function availableCollectionName(title, collections) {
  const base = String(title || '新建书库').trim().slice(0, 70) || '新建书库';
  let name = base;
  let suffix = 2;
  while (collectionNameError(name, collections)) name = `${base} (${suffix++})`;
  return name;
}

const BOOK_FILE = /\.(epub|pdf|cbz|zip|mobi|prc|azw|md|txt)$/i;
const IMAGE_FILE = /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i;

export function planFolderCollections(files) {
  const groups = new Map();
  const imageFolders = new Set();
  let hasDirectories = false;
  for (const file of files) {
    const parts = String(file.customRelativePath || file.webkitRelativePath || file.name).replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.some(part => part.startsWith('.'))) continue;
    const isImage = IMAGE_FILE.test(file.name);
    if (!isImage && !BOOK_FILE.test(file.name)) continue;
    hasDirectories ||= parts.length > 1;
    const directory = parts.slice(0, -1);
    // 每个含作品的目录独立建库；同目录散装图片仍合为一本漫画。
    const path = directory.join('/');
    if (!groups.has(path)) groups.set(path, { path, title: path.split('/').pop() || '导入书库', files: [], bookCount: 0 });
    const group = groups.get(path);
    group.files.push(file);
    const imagePath = directory.join('/');
    if (!isImage || !imageFolders.has(imagePath)) group.bookCount++;
    if (isImage) imageFolders.add(imagePath);
  }
  return { groups: [...groups.values()], hasDirectories, bookCount: [...groups.values()].reduce((sum, group) => sum + group.bookCount, 0) };
}
