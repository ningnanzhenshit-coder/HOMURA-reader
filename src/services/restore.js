/* ============================================================================
   HOMURA · 本地存档
   ----------------------------------------------------------------------------
   把导入来源写进 IndexedDB，并在重新打开应用时取回原始文件、重新解析书籍。
   ========================================================================== */

import { HomuraStore } from './storage.js';
import { canUseOPFS } from './platform.js';
import { putFile, getFile } from './opfs.js';
import { parseEpubFileLazy, parseCbzFileLazy, parseTxtFile, parseMarkdownFile, parsePdfFileLazy, buildImageFolderBooks } from './parsers.js';
import { showToast } from '../composables/useToast.js';


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

function basename(path) {
  return String(path || '').split('/').pop() || 'source';
}

// 没有原文件句柄时（移动端 / 非 Chromium），把文件本体落到 OPFS，只留路径；
// OPFS 不可用则原样保留 Blob，由 IndexedDB 兜底。
async function stageSource(bookId, source) {
  if (source.handle || !canUseOPFS) return source;
  try {
    if (source.kind === 'folder') {
      const entries = [];
      const list = source.entries || [];
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (!entry.blob) {
          entries.push(entry);
          continue;
        }
        const opfsPath = await putFile(
          `${bookId}/${String(i + 1).padStart(3, '0')}/${basename(entry.path)}`,
          entry.blob
        );
        entries.push({ path: entry.path, lastModified: entry.lastModified, opfsPath });
      }
      return { kind: 'folder', name: source.name, entries };
    }
    if (source.blob) {
      const opfsPath = await putFile(`${bookId}/${source.name || 'source'}`, source.blob);
      return { kind: 'file', name: source.name, lastModified: source.lastModified, opfsPath };
    }
  } catch (err) {
    console.warn('[HOMURA] OPFS 写入失败，回落到 IndexedDB Blob', err);
  }
  return source;
}

// 失败时抛错，由调用方（shelf store）统一提示
export async function persistBook(book, source) {
  const meta = {
    id: book.id,
    type: book.type,
    title: book.title,
    pageCount: book.pageCount,
    addedAt: Date.now(),
    coverBlob: book.coverBlob || null
  };
  const staged = await stageSource(book.id, source);
  await HomuraStore.saveBook(meta, Object.assign({ id: book.id }, staged));
  HomuraStore.requestPersistence();
}

// 返回按添加时间倒序的书架数组；IndexedDB 不可用时返回 null
export async function restoreLibrary() {
  let metas = [];
  try {
    metas = await HomuraStore.listBooks();
  } catch (err) {
    return null;
  }
  metas.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return metas.map(meta => ({
    id: meta.id,
    type: meta.type,
    title: meta.title,
    pageCount: meta.pageCount,
    cover: meta.coverBlob ? URL.createObjectURL(meta.coverBlob) : null,
    restored: true
  }));
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
  // 移动端存档路径：直接从 OPFS 取回原文件
  if (source.opfsPath) {
    try {
      return await getFile(source.opfsPath);
    } catch (err) {
      return null;
    }
  }
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
  if (/\.pdf$/i.test(file.name)) return parsePdfFileLazy(file);
  if (/\.(cbz|zip)$/i.test(file.name)) return parseCbzFileLazy(file);
  if (/\.md$/i.test(file.name)) return parseMarkdownFile(file);
  if (/\.txt$/i.test(file.name)) return parseTxtFile(file);
  return null;
}

async function resolveFolderFiles(source) {
  const files = [];
  for (const entry of source.entries || []) {
    let file = null;
    if (entry.opfsPath) {
      try {
        file = await getFile(entry.opfsPath);
      } catch (err) {
        continue;
      }
    } else if (entry.handle) {
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
  book.format = parsed.format;
  book.pageCount = parsed.pageCount;
  book.pageItems = parsed.pageItems;
  book.zipContent = parsed.zipContent;
  book.pdfDoc = parsed.pdfDoc;
  book.chapters = parsed.chapters;
  book.cover = parsed.cover || book.cover;
  book.coverBlob = parsed.coverBlob;
  book.restored = false;
  return true;
}
