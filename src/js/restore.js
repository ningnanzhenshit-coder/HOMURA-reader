/* ============================================================================
   HOMURA · 本地存档
   ----------------------------------------------------------------------------
   把导入来源写进 IndexedDB，并在重新打开应用时取回原始文件、重新解析书籍。
   ========================================================================== */

import { state, showToast } from './core.js';
import { HomuraStore } from './storage.js';
import { parseEpubFileLazy, parseCbzFileLazy, parseTxtFile } from './parsers.js';
import { buildImageFolderBooks } from './importer.js';


export function makeFileSource(file) {
  const source = { kind: 'file', name: file.name, lastModified: file.lastModified || Date.now() };
  if (file.customHandle) source.handle = file.customHandle;
  else source.blob = file;
  return source;
}

export function makeFolderSource(folderName, files) {
  return {
    kind: 'folder',
    name: folderName,
    entries: files.map(f => ({
      path: f.customRelativePath || f.webkitRelativePath || (folderName + '/' + f.name),
      lastModified: f.lastModified || Date.now(),
      blob: f
    }))
  };
}

export async function persistBook(book, source) {
  const meta = {
    id: book.id,
    type: book.type,
    title: book.title,
    pageCount: book.pageCount,
    addedAt: Date.now(),
    coverBlob: book.coverBlob || null
  };
  try {
    await HomuraStore.saveBook(meta, Object.assign({ id: book.id }, source));
    HomuraStore.requestPersistence();
  } catch (err) {
    if (!state.storageNoticeShown) {
      state.storageNoticeShown = true;
      showToast('⚠️ 本地存档不可用，请通过 http://localhost 打开页面');
    }
  }
}

export async function restoreLibrary() {
  let metas = [];
  try {
    metas = await HomuraStore.listBooks();
  } catch (err) {
    return false;
  }
  metas.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  state.library = metas.map(meta => ({
    id: meta.id,
    type: meta.type,
    title: meta.title,
    pageCount: meta.pageCount,
    cover: meta.coverBlob ? URL.createObjectURL(meta.coverBlob) : null,
    restored: true
  }));
  return metas.length > 0;
}

async function ensureReadPermission(handle) {
  try {
    const opts = { mode: 'read' };
    if (await handle.queryPermission(opts) === 'granted') return true;
    if (await handle.requestPermission(opts) === 'granted') return true;
  } catch (err) {}
  return false;
}

async function resolveSourceFile(source) {
  if (source.handle) {
    if (!(await ensureReadPermission(source.handle))) return null;
    try {
      return await source.handle.getFile();
    } catch (err) {
      return null;
    }
  }
  if (source.blob) {
    return new File([source.blob], source.name || 'book', { lastModified: source.lastModified || Date.now() });
  }
  return null;
}

function parseStoredFile(file) {
  if (/\.epub$/i.test(file.name)) return parseEpubFileLazy(file);
  if (/\.(cbz|zip)$/i.test(file.name)) return parseCbzFileLazy(file);
  if (/\.(txt|md)$/i.test(file.name)) return parseTxtFile(file);
  return null;
}

async function resolveFolderFiles(source) {
  const files = [];
  for (const entry of source.entries || []) {
    let file = null;
    if (entry.handle) {
      if (!(await ensureReadPermission(entry.handle))) continue;
      try {
        file = await entry.handle.getFile();
      } catch (err) {
        continue;
      }
    } else if (entry.blob) {
      file = new File([entry.blob], entry.path.split('/').pop(), { lastModified: entry.lastModified || Date.now() });
    }
    if (!file) continue;
    try {
      Object.defineProperty(file, 'customRelativePath', { value: entry.path, writable: false });
    } catch (err) {}
    files.push(file);
  }
  return files;
}

// 书架里只有元数据；第一次点开时才回到存档里取原始文件重新解析
export async function hydrateBook(book) {
  let source = null;
  try {
    source = await HomuraStore.getSource(book.id);
  } catch (err) {}
  if (!source) {
    showToast('本地存档已丢失，请重新导入该作品');
    return false;
  }

  showToast(`正在从本地存档恢复《${book.title}》...`);
  let parsed = null;
  if (source.kind === 'folder') {
    const files = await resolveFolderFiles(source);
    if (files.length === 0) {
      showToast('原文件夹已移动或被删除，请重新导入');
      return false;
    }
    const groups = buildImageFolderBooks(files);
    parsed = groups.length > 0 ? groups[0].book : null;
  } else {
    const file = await resolveSourceFile(source);
    if (!file) {
      showToast('原文件已移动或被删除，请重新导入');
      return false;
    }
    parsed = await parseStoredFile(file);
  }

  if (!parsed) return false;
  book.type = parsed.type;
  book.pageCount = parsed.pageCount;
  book.pageItems = parsed.pageItems;
  book.zipContent = parsed.zipContent;
  book.chapters = parsed.chapters;
  book.cover = parsed.cover || book.cover;
  book.coverBlob = parsed.coverBlob;
  book.restored = false;
  return true;
}
