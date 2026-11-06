/* ============================================================================
   HOMURA · 本地存档
   ----------------------------------------------------------------------------
   把导入来源写进 IndexedDB，并在重新打开应用时取回原始文件、重新解析书籍。
   ========================================================================== */

import { HomuraStore } from './storage.js';
import { canUseOPFS, isAndroid } from './platform.js';
import { putFile, getFile, removeFile, removeBookDir } from './opfs.js';
import {
  canUseNativeStorage,
  getNativeFile,
  nativeFilePath,
  putNativeFile,
  removeNativeBookDir,
  removeNativeFile
} from './nativeStorage.js';
import { parseEpubFileLazy, parseCbzFileLazy, parseCbzNativeArchive, parseTxtFile, parseMobiFileLazy, parseMarkdownFile, parsePdfFileLazy, buildImageFolderBooks } from './parsers.js';
import { parseEpubNativeArchive } from './epubParser.js';
import { createCoverThumbnail } from './coverThumb.js';
import { canUseNativeArchive } from './nativeArchive.js';

export function makeFileSource(file) {
  const source = {
    kind: 'file',
    name: file.name,
    size: file.size,
    lastModified: file.lastModified || Date.now(),
    blob: file
  };
  if (file.customHandle) source.handle = file.customHandle;
  return source;
}

// Android 压缩包 / EPUB 在解析前先流式落到 AppData，原生插件随后直接按路径随机读取。
// source.preStaged 让 persistBook 复用这份已写好的文件，避免导入后再整本复制一次。
export async function stageNativeFileSource(bookId, file, onProgress) {
  if (!canUseNativeStorage()) throw new Error('原生存档不可用');
  const nativePath = await putNativeFile(
    nativeFilePath(bookId, `source/${file.name || 'source'}`),
    file,
    onProgress
  );
  return {
    kind: 'file',
    name: file.name,
    size: file.size,
    lastModified: file.lastModified || Date.now(),
    nativePath,
    preStaged: true
  };
}

export function makeFolderSource(folderName, files) {
  return {
    kind: 'folder',
    name: folderName,
    entries: files.map(f => ({
      path: f.customRelativePath || f.webkitRelativePath || (folderName + '/' + f.name),
      size: f.size,
      lastModified: f.lastModified || Date.now(),
      blob: f
    }))
  };
}

function basename(path) {
  return String(path || '').split('/').pop() || 'source';
}

function withoutBlob(source) {
  const { blob, ...rest } = source;
  return rest;
}

async function readSourceBlob(source) {
  if (source.blob) return source.blob;
  if (!source.handle || !(await ensureReadPermission(source.handle))) return null;
  try {
    return await source.handle.getFile();
  } catch (err) {
    return null;
  }
}

async function sourceWithBlobCopy(source) {
  const blob = await readSourceBlob(source);
  if (!blob) return source;
  return {
    kind: source.kind,
    name: source.name,
    size: source.size,
    lastModified: source.lastModified,
    blob
  };
}

async function stageBlob(path, blob) {
  const opfsPath = await putFile(path, blob);
  try {
    const stored = await getFile(opfsPath);
    if (stored.size !== blob.size) {
      throw new Error(`OPFS 回读大小不一致：${stored.size} / ${blob.size}`);
    }
    return opfsPath;
  } catch (err) {
    await removeFile(opfsPath);
    throw err;
  }
}

// 没有原文件句柄时优先落原生 AppData（Android）或 OPFS（桌面），失败则保留 Blob。
async function stageSource(bookId, source, onProgress) {
  // 桌面端句柄是零拷贝引用，跨重启可用；Android 的 content:// 句柄不可靠。
  if (source.handle && !isAndroid) return withoutBlob(source);
  if (source.preStaged && source.nativePath) {
    const { preStaged, ...staged } = source;
    return staged;
  }

  if (canUseNativeStorage()) {
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
          try {
            const nativePath = await putNativeFile(
              nativeFilePath(
                bookId,
                `files/${String(i + 1).padStart(3, '0')}/${basename(entry.path)}`
              ),
              entry.blob
            );
            entries.push({
              path: entry.path,
              size: entry.size,
              lastModified: entry.lastModified,
              nativePath
            });
          } catch (err) {
            console.warn('[HOMURA] 原生存档单文件写入失败，保留 IndexedDB Blob', entry.path, err);
            await removeNativeFile(
              nativeFilePath(
                bookId,
                `files/${String(i + 1).padStart(3, '0')}/${basename(entry.path)}`
              )
            );
            entries.push(entry);
          }
        }
        return { kind: 'folder', name: source.name, entries };
      }
      const fileBlob = await readSourceBlob(source);
      if (fileBlob) {
        const nativePath = await putNativeFile(
          nativeFilePath(bookId, `source/${source.name || 'source'}`),
          fileBlob,
          onProgress
        );
        return {
          kind: 'file',
          name: source.name,
          size: fileBlob.size,
          lastModified: source.lastModified,
          nativePath
        };
      }
    } catch (err) {
      console.warn('[HOMURA] Android 原生存档写入失败，回落 IndexedDB Blob', err);
      await removeNativeBookDir(bookId);
    }
  }

  // Android 即使插件异常也不能再保存句柄；本次仍能读到 File 时必须留下 Blob 副本。
  if (isAndroid) return sourceWithBlobCopy(source);
  if (!canUseOPFS) return source;
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
        try {
          const opfsPath = await stageBlob(
            `${bookId}/${String(i + 1).padStart(3, '0')}/${basename(entry.path)}`,
            entry.blob
          );
          entries.push({
            path: entry.path,
            size: entry.size,
            lastModified: entry.lastModified,
            opfsPath
          });
        } catch (err) {
          console.warn('[HOMURA] OPFS 单文件写入校验失败，保留 IndexedDB Blob', entry.path, err);
          entries.push(entry);
        }
      }
      return { kind: 'folder', name: source.name, entries };
    }
    if (source.blob) {
      const opfsPath = await stageBlob(`${bookId}/${source.name || 'source'}`, source.blob);
      return {
        kind: 'file',
        name: source.name,
        size: source.size,
        lastModified: source.lastModified,
        opfsPath
      };
    }
  } catch (err) {
    console.warn('[HOMURA] OPFS 写入或回读校验失败，回落到 IndexedDB Blob', err);
  }
  return source;
}

// 失败时抛错，由调用方（shelf store）统一提示
export async function persistBook(book, source, collection, onProgress) {
  // 封面解码和原文件暂存可以并行，避免导入多等一次缩略图生成。
  const coverThumbTask = createCoverThumbnail(book.coverBlob).catch(() => null);
  const meta = {
    id: book.id,
    type: book.type,
    format: book.format || null,
    title: book.title,
    favorite: !!book.favorite,
    pageCount: book.pageCount,
    addedAt: Date.now(),
    coverBlob: book.coverBlob || null
  };
  // 在用户触发导入时申请持久存储，避免配额压力下先清掉小体积的书架记录
  try {
    const persistence = await HomuraStore.requestPersistence();
    const staged = await stageSource(book.id, source, onProgress);
    const coverThumb = await coverThumbTask;
    if (coverThumb) meta.coverBlob = coverThumb;
    await HomuraStore.saveBook(meta, Object.assign({ id: book.id }, staged), collection);
    return { persistence };
  } catch (err) {
    // 元数据没有提交成功时，OPFS / AppData 里已暂存的文件都属于失败导入，必须一并回收。
    await Promise.allSettled([removeBookDir(book.id), removeNativeBookDir(book.id)]);
    throw err;
  }
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
    format: meta.format || null,
    title: meta.title,
    favorite: !!meta.favorite,
    pageCount: meta.pageCount,
    cover: (meta.customCoverBlob || meta.coverBlob) ? URL.createObjectURL(meta.customCoverBlob || meta.coverBlob) : null,
    coverBlob: meta.coverBlob || null,
    customCoverBlob: meta.customCoverBlob || null,
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

function errorSummary(err) {
  if (!err) return '未知错误';
  return err.name ? `${err.name}: ${err.message || ''}` : String(err.message || err);
}

function logSourceFailures(bookId, failures) {
  if (!failures.length) return;
  console.warn('[HOMURA] 原文件恢复失败明细', {
    bookId,
    failures: failures.map(item => ({
      kind: item.kind,
      path: item.path || undefined,
      error: errorSummary(item.error)
    }))
  });
}

function makeRestoredFile(blob, name, lastModified, type) {
  return new File([blob], name, {
    type: type || blob.type || '',
    lastModified: lastModified || blob.lastModified || Date.now()
  });
}

function releaseParsedCover(parsed) {
  const cover = parsed?.cover;
  if (!cover || !cover.startsWith('blob:')) return;
  // 漫画 EPUB / CBZ 的第一页与封面共用同一个 Blob URL，不能直接释放。
  if ((parsed.pageItems || []).some(item => item.url === cover)) return;
  URL.revokeObjectURL(cover);
}

// 依次尝试原生 AppData、OPFS、原文件句柄、内嵌 Blob；前一层失效时继续用后一层。
async function resolveStoredFile(source, displayName) {
  const failures = [];
  if (source.nativePath) {
    try {
      const stored = await getNativeFile(source.nativePath);
      if (typeof source.size === 'number' && stored.size !== source.size) {
        throw new Error(`原生存档文件大小不一致：${stored.size} / ${source.size}`);
      }
      return {
        file: makeRestoredFile(stored, displayName, source.lastModified, stored.type),
        failures
      };
    } catch (err) {
      failures.push({ kind: 'native', path: source.nativePath, error: err });
    }
  }
  if (source.opfsPath) {
    try {
      const stored = await getFile(source.opfsPath);
      if (typeof source.size === 'number' && stored.size !== source.size) {
        throw new Error(`OPFS 文件大小不一致：${stored.size} / ${source.size}`);
      }
      return {
        file: makeRestoredFile(stored, displayName, source.lastModified, stored.type),
        failures
      };
    } catch (err) {
      failures.push({ kind: 'opfs', path: source.opfsPath, error: err });
    }
  }
  if (source.handle) {
    if (!(await ensureReadPermission(source.handle))) {
      failures.push({ kind: 'handle', error: new Error('文件读取权限失效') });
    } else {
      try {
        const file = await source.handle.getFile();
        return {
          file: makeRestoredFile(file, displayName, source.lastModified || file.lastModified, file.type),
          failures
        };
      } catch (err) {
        failures.push({ kind: 'handle', error: err });
      }
    }
  }
  if (source.blob) {
    try {
      return {
        file: makeRestoredFile(
          source.blob,
          displayName,
          source.lastModified || source.blob.lastModified,
          source.blob.type
        ),
        failures
      };
    } catch (err) {
      failures.push({ kind: 'blob', error: err });
    }
  }
  return { file: null, failures };
}

function parseStoredFile(file, options = {}) {
  if (/\.epub$/i.test(file.name)) return parseEpubFileLazy(file, options);
  if (/\.pdf$/i.test(file.name)) return parsePdfFileLazy(file);
  if (/\.(cbz|zip)$/i.test(file.name)) return parseCbzFileLazy(file, options);
  if (/\.(mobi|prc|azw)$/i.test(file.name)) return parseMobiFileLazy(file);
  if (/\.md$/i.test(file.name)) return parseMarkdownFile(file);
  if (/\.txt$/i.test(file.name)) return parseTxtFile(file);
  return null;
}

function isStoredFileFormatSupported(file) {
  return /\.(epub|pdf|cbz|zip|mobi|prc|azw|md|txt)$/i.test(file.name);
}

async function resolveFolderFiles(source) {
  const files = [];
  const failures = [];
  for (const entry of source.entries || []) {
    const resolved = await resolveStoredFile(entry, basename(entry.path));
    const file = resolved.file;
    if (!file) {
      failures.push(...resolved.failures.map(item => ({ ...item, path: entry.path })));
      continue;
    }
    if (resolved.failures.length > 0) {
      console.warn('[HOMURA] 图片已从备用存档恢复', entry.path, resolved.failures.map(item => item.kind));
    }
    try {
      Object.defineProperty(file, 'customRelativePath', { value: entry.path, writable: false });
    } catch (err) {}
    files.push(file);
  }
  return { files, failures };
}

function sourceFailureMessage(source, failures, isFolder) {
  const kinds = new Set(failures.map(item => item.kind));
  const hasNative = kinds.has('native') || !!source.nativePath;
  const hasOpfs = kinds.has('opfs') || !!source.opfsPath;
  const hasHandle = kinds.has('handle') || !!source.handle;
  const hasInline = kinds.has('blob') || !!source.blob;
  const subject = isFolder ? '文件夹' : '文件';

  if ((hasNative || hasOpfs) && hasHandle) {
    return `应用内存档和原${subject}均无法读取，请重新导入`;
  }
  if (isAndroid && hasHandle) {
    return `旧版 Android 存档只记录了系统文件句柄，没有保存文件副本，请重新导入该作品`;
  }
  if (hasHandle) {
    return `原${subject}已移动、删除或访问权限失效，请重新导入`;
  }
  if (hasNative || hasOpfs) {
    return `应用内本地存档读取失败，请重新导入该作品`;
  }
  if (hasInline) {
    return `本地存档中的原${subject}已损坏，请重新导入该作品`;
  }
  return `本地存档中的原${subject}不存在，请重新导入该作品`;
}

// 书架里只有元数据；第一次点开时才回到存档里取原始文件重新解析
export async function hydrateBook(book) {
  let source = null;
  let sourceError = null;
  try {
    source = await HomuraStore.getSource(book.id);
  } catch (err) {
    sourceError = err;
  }
  if (sourceError) {
    console.error('[HOMURA] 读取本地存档失败', sourceError);
    return false;
  }
  if (!source) {
    console.warn('[HOMURA] 本地存档已丢失', book.id);
    return false;
  }

  let parsed = null;
  if (source.kind === 'folder') {
    const { files, failures } = await resolveFolderFiles(source);
    logSourceFailures(book.id, failures);
    if (files.length === 0) {
      console.warn('[HOMURA] 原文件夹恢复失败', sourceFailureMessage(source, failures, true));
      return false;
    }
    if (failures.length > 0) {
      console.warn(`[HOMURA] 有 ${failures.length} 张图片未从本地存档恢复`);
    }
    const groups = buildImageFolderBooks(files);
    parsed = groups.length > 0 ? groups[0].book : null;
  } else {
    // 安卓原生压缩包 / EPUB 不需要把整个原文件读回 JS；失败时才回退到 Blob 解析。
    if (source.nativePath && canUseNativeArchive()) {
      if (/\.epub$/i.test(source.name || '')) {
        try {
          parsed = await parseEpubNativeArchive(source.nativePath, {
            id: book.id,
            name: source.name
          });
        } catch (err) {
          console.warn('[HOMURA] 原生 EPUB 恢复失败，回退完整存档读取', err);
        }
      } else if (/\.(cbz|zip)$/i.test(source.name || '')) {
        try {
          parsed = await parseCbzNativeArchive(source.nativePath, {
            id: book.id,
            name: source.name
          });
        } catch (err) {
          console.warn('[HOMURA] 原生压缩包恢复失败，回退完整存档读取', err);
        }
      }
    }

    if (!parsed) {
      const { file, failures } = await resolveStoredFile(source, source.name || 'book');
      logSourceFailures(book.id, failures);
      if (!file) {
        console.warn('[HOMURA] 原文件恢复失败', sourceFailureMessage(source, failures, false));
        return false;
      }
      try {
        parsed = await parseStoredFile(file, { id: book.id });
      } catch (err) {
        console.error('[HOMURA] 本地存档解析失败', err);
        return false;
      }
      if (!parsed) {
        if (!isStoredFileFormatSupported(file)) {
          console.warn('[HOMURA] 无法识别本地存档格式', file.name);
        }
        return false;
      }
    }
  }

  if (!parsed) return false;
  const previousMeta = {
    type: book.type,
    format: book.format || null,
    pageCount: book.pageCount
  };
  book.type = parsed.type;
  book.format = parsed.format;
  book.pageCount = parsed.pageCount;
  book.pageItems = parsed.pageItems;
  book.zipContent = parsed.zipContent;
  book.pdfDoc = parsed.pdfDoc;
  book.chapters = parsed.chapters;
  book.nativeArchiveId = parsed.nativeArchiveId || null;
  book.nativeArchivePath = parsed.nativeArchiveId
    ? (parsed.nativeArchivePath || source.nativePath || null)
    : null;
  book.nativeArchiveMode = parsed.nativeArchiveMode || null;
  book.nativeEntryIndexByPath = parsed.nativeEntryIndexByPath || null;
  book.nativeArchiveStaged = false;
  // 书架元数据里保存的是小封面，重新解析出的大图不应覆盖它；
  // 只有旧存档没有封面时才回退到解析结果。
  if (book.customCoverBlob || book.cover) releaseParsedCover(parsed);
  else book.cover = parsed.cover || book.cover;
  book.coverBlob = parsed.coverBlob;
  book.restored = false;
  // 旧版本可能把带彩插的轻小说存成漫画；重新解析后把更正写回书架元数据。
  const metaNeedsRefresh = previousMeta.type !== book.type
    || previousMeta.format !== (book.format || null)
    || previousMeta.pageCount !== book.pageCount;
  if (metaNeedsRefresh) {
    try {
      await HomuraStore.updateBookMeta(book.id, {
        type: book.type,
        format: book.format || null,
        pageCount: book.pageCount
      });
    } catch (err) {
      console.warn('[HOMURA] 书本信息回写失败，下次打开会再次校正', err);
    }
  }
  return true;
}
