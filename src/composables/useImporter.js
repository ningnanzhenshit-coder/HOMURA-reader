/* ============================================================================
   HOMURA · 导入引擎（Composable）
   ----------------------------------------------------------------------------
   文件选择、文件夹选择、拖拽导入，以及 File System Access 句柄采集。
   ========================================================================== */

import { useShelfStore } from '../stores/shelf.js';
import { useDuplicateImport } from './useDuplicateImport.js';
import { useShelfDialogs } from './useShelfDialogs.js';
import { planFolderCollections, availableCollectionName, collectionNameError } from '../services/collections.js';
import { findSameTitleBook } from '../services/bookTitles.js';
import { HomuraStore } from '../services/storage.js';
import { formatBytes } from '../services/platform.js';
import { parseEpubFileLazy, parseCbzFileLazy, parseTxtFile, parseMobiFileLazy, parseMarkdownFile, parsePdfFileLazy, buildImageFolderBooks, discardParsedBook } from '../services/parsers.js';
import { MobiError } from '../services/mobi.js';
import { makeFileSource, makeFolderSource } from '../services/restore.js';
import { runShelfMutation } from '../services/mutationQueue.js';

let quotaWarned = false;

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

  function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(f => !f.name.startsWith('.'));
    if (files.length === 0) return;

    // 所有导入入口与清空书架共用互斥队列，防止同名漏判和源文件删除竞态。
    const targetId = shelf.activeCollectionId;
    return runShelfMutation(async () => {
      const mobiFailures = [];
      await importBatch(files, targetId, mobiFailures);
      if (mobiFailures.length) {
        const details = mobiFailures.slice(0, 5);
        if (mobiFailures.length > details.length) details.push(`另有 ${mobiFailures.length - details.length} 个 MOBI 文件未导入。`);
        await askShelfDialog({ kind: 'notice', title: '部分 MOBI 文件未导入', message: details.join('\n') });
      }
    }).catch(err => {
      console.error('[HOMURA] 导入失败', err);
      throw err;
    });
  }

  async function importBatch(files, targetId, mobiFailures) {
    const importIntoCurrent = async () => {
      const ids = await importFiles(files, mobiFailures);
      if (ids.length && targetId && shelf.collections.some(item => item.id === targetId)) await shelf.moveBooks(ids, targetId);
    };
    const plan = planFolderCollections(files);
    if (!plan.hasDirectories || plan.bookCount < 2) return importIntoCurrent();
    const create = await askShelfDialog({
      kind: 'folder', title: '为导入内容创建书库？',
      message: `检测到 ${plan.bookCount} 本作品，将按目录分别创建 ${plan.groups.length} 个一级书库。你可以依次修改名称；选择直接导入则不建立书库。`
    });
    if (create === null) return;
    if (!create) return importIntoCurrent();
    const reserved = [...shelf.collections];
    const groups = [];
    // 所有名称确认后才导入；中途取消不会留下半批书库。
    for (const group of plan.groups) {
      const title = await askShelfDialog({ kind: 'name', title: '创建导入书库', message: `目录：${group.path || group.title} · ${group.bookCount} 本作品`, initialName: availableCollectionName(group.title, reserved), validate: name => collectionNameError(name, reserved) });
      if (title === null) return;
      reserved.push({ title });
      groups.push({ ...group, title });
    }
    for (const group of groups) {
      const ids = await importFiles(group.files, mobiFailures);
      if (!ids.length) continue;
      const collection = await shelf.createCollection(group.title);
      await shelf.moveBooks(ids, collection.id);
    }
    shelf.activeCollectionId = null;
  }

  async function importFiles(files, mobiFailures) {
    const savedBooks = [];
    let skippedCount = 0;
    let failedCount = 0;
    const addBook = async (book, source) => {
      const existingBook = findSameTitleBook(shelf.library, book.title);
      if (existingBook && !(await confirmDuplicate(book, existingBook))) {
        skippedCount++;
        await discardParsedBook(book);
        return;
      }
      try {
        // 串行等待落盘完成：下一本的同名检测必须能看到这一批已保存的书。
        await shelf.addBook(book, source);
        savedBooks.push(book);
      } catch (err) {
        failedCount++;
        console.warn('[HOMURA] 本地存档写入失败，已跳过', book.title, err);
        await discardParsedBook(book);
      }
    };

    const epubFiles = files.filter(f => /\.epub$/i.test(f.name));
    for (const epubFile of epubFiles) {
      const book = await parseEpubFileLazy(epubFile);
      if (book) await addBook(book, makeFileSource(epubFile));
    }

    const pdfFiles = files.filter(f => /\.pdf$/i.test(f.name));
    for (const pdfFile of pdfFiles) {
      const book = await parsePdfFileLazy(pdfFile);
      if (book) await addBook(book, makeFileSource(pdfFile));
    }

    const archiveFiles = files.filter(f => /\.(cbz|zip)$/i.test(f.name));
    for (const archiveFile of archiveFiles) {
      const book = await parseCbzFileLazy(archiveFile);
      if (book) await addBook(book, makeFileSource(archiveFile));
    }

    const mobiFiles = files.filter(f => /\.(mobi|prc|azw)$/i.test(f.name));
    for (const mobiFile of mobiFiles) {
      let book;
      try {
        book = await parseMobiFileLazy(mobiFile);
      } catch (err) {
        console.warn('[HOMURA] MOBI 解析失败', mobiFile.name, err);
        const reason = err instanceof MobiError ? err.message : '文件无法读取。';
        mobiFailures.push(`${mobiFile.name}：${reason}`);
        continue;
      }
      await addBook(book, makeFileSource(mobiFile));
    }

    const mdFiles = files.filter(f => /\.md$/i.test(f.name));
    for (const mdFile of mdFiles) {
      const book = await parseMarkdownFile(mdFile);
      if (book) await addBook(book, makeFileSource(mdFile));
    }

    const txtFiles = files.filter(f => /\.txt$/i.test(f.name));
    for (const txtFile of txtFiles) {
      const book = await parseTxtFile(txtFile);
      if (book) await addBook(book, makeFileSource(txtFile));
    }

    const imgFiles = files.filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(f.name));
    for (const group of buildImageFolderBooks(imgFiles)) {
      await addBook(group.book, makeFolderSource(group.folderName, group.files));
    }

    if (failedCount > 0) {
      console.warn(`[HOMURA] ${failedCount} 部作品未能保存到本地存档`);
    } else if (savedBooks.length === 0 && skippedCount === 0 && !mobiFiles.length) {
      console.warn('[HOMURA] 未找到支持的漫画或小说格式');
    }
    if (savedBooks.length > 0) await warnIfStorageTight();
    return savedBooks.map(book => book.id);
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

  async function pickFilesViaFSA() {
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
    if (files.length > 0) await handleFiles(files);
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
