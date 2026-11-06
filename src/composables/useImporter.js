/* ============================================================================
   HOMURA · 导入引擎（Composable）
   ----------------------------------------------------------------------------
   文件选择、文件夹选择、拖拽导入，以及 File System Access 句柄采集。
   ========================================================================== */

import { useShelfStore } from '../stores/shelf.js';
import { useDuplicateImport } from './useDuplicateImport.js';
import { useShelfDialogs } from './useShelfDialogs.js';
import { planFolderCollections, availableCollectionName, collectionNameError, isImageImportFile } from '../services/collections.js';
import { findSameTitleBook } from '../services/bookTitles.js';
import { HomuraStore } from '../services/storage.js';
import { formatBytes } from '../services/platform.js';
import { parseCbzFileLazy, parseTxtFile, parseMobiFileLazy, parseMarkdownFile, parsePdfFileLazy, buildImageFolderBooks, discardParsedBook } from '../services/parsers.js';
import { parseEpubFile } from '../services/epubParser.js';
import { makeFileSource, makeFolderSource, stageNativeFileSource } from '../services/restore.js';
import { canUseNativeArchive, releaseNativeArchiveSession } from '../services/nativeArchive.js';
import { removeNativeBookDir } from '../services/nativeStorage.js';
import { runShelfMutation } from '../services/mutationQueue.js';

let quotaWarned = false;

function allowShelfPaint() {
  if (typeof requestAnimationFrame !== 'function' || document.hidden) return Promise.resolve();
  return new Promise(resolve => {
    const fallback = setTimeout(() => {
      cancelAnimationFrame(frame);
      resolve();
    }, 100);
    const frame = requestAnimationFrame(() => {
      clearTimeout(fallback);
      setTimeout(resolve, 0);
    });
  });
}

// 移动端原文件会整份落盘，配额比桌面更容易吃满，导入后检查一次
async function warnIfStorageTight() {
  if (quotaWarned) return;
  const info = await HomuraStore.estimateStorage();
  if (!info || !info.quota) return;
  const free = info.quota - info.usage;
  if (info.ratio >= 0.85 || free < 200 * 1024 * 1024) {
    quotaWarned = true;
    console.warn(`[HOMURA] 存储空间紧张：已用 ${formatBytes(info.usage)} / ${formatBytes(info.quota)}`);
  }
}

export function useImporter() {
  const shelf = useShelfStore();
  const { confirmDuplicate } = useDuplicateImport();
  const { askShelfDialog } = useShelfDialogs();

  function handleFiles(fileList, { offerCollection = false } = {}) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(f => !f.name.startsWith('.'));
    if (files.length === 0) return;

    // 所有导入入口与清空书架共用互斥队列，防止同名漏判和源文件删除竞态。
    const targetId = shelf.activeCollectionId;
    return runShelfMutation(() => importBatch(files, targetId, offerCollection)).catch(err => {
      console.error('[HOMURA] 导入失败', err);
      throw err;
    });
  }

  async function importBatch(files, targetId, offerCollection) {
    const plan = planFolderCollections(files);
    const importIntoCurrent = async () => {
      const target = shelf.collections.find(item => item.id === targetId);
      const total = plan.bookCount;
      if (target && total) setCollectionProgress(target, 0, total);
      try {
        await importFiles(plan.groups.flatMap(group => group.files), target?.id, total);
      } finally {
        shelf.importingCollections = {};
      }
    };
    if (targetId || plan.bookCount < 2 || (!plan.hasDirectories && !offerCollection)) return importIntoCurrent();
    const grouping = plan.hasDirectories ? `按目录分别创建 ${plan.groups.length} 个一级书库` : '将这批作品放进一个新书库';
    const create = await askShelfDialog({
      kind: 'folder', title: '为导入内容创建书库？',
      message: `检测到 ${plan.bookCount} 本作品。可以${grouping}，也可以直接导入。`
    });
    if (create === null) return;
    if (!create) return importIntoCurrent();
    const reserved = [...shelf.collections];
    const groups = [];
    // 所有名称确认后才显示书库；取消不会留下半批书库。
    for (const group of plan.groups) {
      const message = group.path ? `目录：${group.path} · ${group.bookCount} 本作品` : `${group.bookCount} 本作品`;
      const title = await askShelfDialog({ kind: 'name', title: '创建导入书库', message, initialName: availableCollectionName(group.title, reserved), validate: name => collectionNameError(name, reserved) });
      if (title === null) return;
      const collection = { id: `collection_${crypto.randomUUID()}`, title, createdAt: Date.now(), bookIds: [] };
      reserved.push(collection);
      groups.push({ ...group, collection });
    }
    shelf.activeCollectionId = null;
    for (const { collection, bookCount } of groups) setCollectionProgress(collection, 0, bookCount);
    try {
      for (const { collection, files, bookCount } of groups) {
        await importFiles(files, collection, bookCount);
        const remaining = { ...shelf.importingCollections };
        delete remaining[collection.id];
        shelf.importingCollections = remaining;
      }
    } finally {
      shelf.importingCollections = {};
    }
  }

  function setCollectionProgress(collection, loaded, total) {
    shelf.importingCollections = { ...shelf.importingCollections, [collection.id]: { collection, loaded, total } };
  }

  async function importFiles(files, target, total) {
    const targetId = typeof target === 'string' ? target : target?.id;
    let savedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    if (targetId) await allowShelfPaint();

    const importBook = async (preview, load) => {
      let displayedRatio = 0;
      const reportProgress = ratio => {
        if (targetId || ratio - displayedRatio < 0.02) return;
        displayedRatio = ratio;
        shelf.importingBook = { ...shelf.importingBook, ratio };
      };
      if (!targetId) {
        shelf.importingBook = { book: preview, ratio: 0 };
        await allowShelfPaint();
      }
      let book;
      try {
        const result = await load(reportProgress);
        book = result?.book;
        if (!book) {
          failedCount++;
          return;
        }
        const existingBook = findSameTitleBook(shelf.library, book.title);
        if (!targetId) {
          const { id, title, type, format, cover, pageCount } = book;
          shelf.importingBook = { book: { id, title, type, format, cover, pageCount }, ratio: 0.55 };
          displayedRatio = 0.55;
          await allowShelfPaint();
        }
        if (existingBook && !(await confirmDuplicate(book, existingBook))) {
          skippedCount++;
          await discardParsedBook(book);
          return;
        }
        // 第一本成功落盘时一同建立新书库，后续书只写入该书库。
        await shelf.addBook(book, result.source, savedCount ? targetId : target,
          ratio => reportProgress(0.55 + ratio * 0.4));
      } catch (err) {
        failedCount++;
        console.warn('[HOMURA] 导入作品失败，已跳过', preview.title, err);
        if (book) await discardParsedBook(book);
        return;
      } finally {
        if (!targetId) shelf.importingBook = null;
      }
      savedCount++;
      if (targetId) {
        setCollectionProgress(shelf.importingCollections[targetId].collection, savedCount, total);
        if (savedCount < total) await allowShelfPaint();
      }
      await releaseNativeArchiveSession(book);
      book.nativeArchiveStaged = false;
    };

    const formats = [
      [/\.epub$/i, 'epub', 'epub', parseEpubFile, true],
      [/\.pdf$/i, 'pdf', 'manga', parsePdfFileLazy],
      [/\.(cbz|zip)$/i, 'cbz', 'manga', parseCbzFileLazy, true],
      [/\.(mobi|prc|azw)$/i, 'mobi', 'novel', parseMobiFileLazy],
      [/\.md$/i, 'markdown', 'novel', parseMarkdownFile],
      [/\.txt$/i, 'txt', 'novel', parseTxtFile]
    ];
    for (const [pattern, format, type, parse, nativeArchive] of formats) {
      for (const file of files.filter(file => pattern.test(file.name))) {
        const id = `${format}_${crypto.randomUUID()}`;
        const preview = { id, format, type, title: file.name.replace(pattern, '') };
        await importBook(preview, async reportProgress => {
          if (nativeArchive) return parseArchive(file, id, parse, ratio => reportProgress(ratio * 0.5));
          const book = format === 'mobi'
            ? await parse(file, ratio => reportProgress(ratio * 0.5))
            : await parse(file);
          if (book) book.id = id;
          return { book, source: makeFileSource(file) };
        });
      }
    }

    for (const group of buildImageFolderBooks(files.filter(isImageImportFile))) {
      const { id, type, format, title, cover } = group.book;
      await importBook({ id, type, format, title, cover }, () => ({ book: group.book, source: makeFolderSource(group.folderName, group.files) }));
    }
    if (failedCount > 0) console.warn(`[HOMURA] ${failedCount} 部作品导入失败`);
    else if (!savedCount && !skippedCount) console.warn('[HOMURA] 未找到支持的漫画或小说格式');
    if (savedCount) await warnIfStorageTight();
  }

  async function parseArchive(file, id, parse, onProgress) {
    let source = makeFileSource(file);
    let nativePath = '';
    // Android 流式写入 AppData，压缩包通过原生入口读取，避免整本进入 WebView。
    if (canUseNativeArchive()) {
      try {
        source = await stageNativeFileSource(id, file, onProgress);
        nativePath = source.nativePath;
      } catch (err) {
        console.warn('[HOMURA] 原生压缩包预存失败，沿用 JSZip', err);
        await removeNativeBookDir(id).catch(() => {});
      }
    }
    let book;
    try {
      book = await parse(file, { id, name: file.name, nativePath, staged: !!nativePath });
    } catch (err) {
      console.warn('[HOMURA] 压缩包解析失败', err);
    }
    if (book) book.nativeArchiveStaged = !!nativePath;
    else if (nativePath) await removeNativeBookDir(id).catch(() => {});
    return { book, source };
  }
  // ---- 拖拽：递归遍历 webkitGetAsEntry 目录树 ----

  function traverseFileTree(item, path, outList) {
    return new Promise(resolve => {
      if (item.isFile) {
        item.file(file => {
          try {
            Object.defineProperty(file, 'customRelativePath', {
              value: path + file.name,
              writable: false
            });
          } catch (err) {}
          outList.push(file);
          resolve();
        }, () => resolve());
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const readEntriesBatch = () => {
          dirReader.readEntries(async entries => {
            if (!entries || entries.length === 0) {
              resolve();
            } else {
              for (const entry of entries) {
                await traverseFileTree(entry, path + item.name + '/', outList);
              }
              readEntriesBatch();
            }
          }, () => resolve());
        };
        readEntriesBatch();
      } else {
        resolve();
      }
    });
  }

  async function handleDrop(e) {
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const collectedFiles = [];
      const entries = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) entries.push(entry);
          else {
            const f = item.getAsFile();
            if (f) collectedFiles.push(f);
          }
        }
      }
      if (entries.length > 0) {
        for (const entry of entries) {
          await traverseFileTree(entry, '', collectedFiles);
        }
        if (collectedFiles.length > 0) {
          await handleFiles(collectedFiles);
          return;
        }
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  }

  // ---- File System Access：优先引用原文件句柄 ----

  async function pickFilesViaFSA(options) {
    let handles = [];
    try {
      handles = await window.showOpenFilePicker({ multiple: true });
    } catch (err) {
      return;
    }
    const files = [];
    for (const handle of handles) {
      try {
        const file = await handle.getFile();
        Object.defineProperty(file, 'customHandle', { value: handle, writable: false });
        files.push(file);
      } catch (err) {}
    }
    if (files.length > 0) await handleFiles(files, options);
  }

  async function pickFolderViaFSA() {
    let dirHandle = null;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (err) {
      return;
    }
    const files = [];
    await collectFilesFromDirHandle(dirHandle, dirHandle.name + '/', files);
    if (files.length > 0) await handleFiles(files);
    else console.warn('[HOMURA] 该文件夹内没有可导入的文件');
  }

  // ---- 递归遍历目录句柄，收集文件 ----

  async function collectFilesFromDirHandle(dirHandle, path, out) {
    for await (const [name, entry] of dirHandle.entries()) {
      if (name.startsWith('.')) continue;
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();
          Object.defineProperty(file, 'customRelativePath', { value: path + name, writable: false });
          out.push(file);
        } catch (err) {}
      } else if (entry.kind === 'directory') {
        await collectFilesFromDirHandle(entry, path + name + '/', out);
      }
    }
  }

  return {
    handleFiles,
    handleDrop,
    pickFilesViaFSA,
    pickFolderViaFSA
  };
}
