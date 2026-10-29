/* ============================================================================
   HOMURA · 导入引擎（Composable）
   ----------------------------------------------------------------------------
   文件选择、文件夹选择、拖拽导入，以及 File System Access 句柄采集。
   ========================================================================== */

import { useShelfStore } from '../stores/shelf.js';
import { HomuraStore } from '../services/storage.js';
import { formatBytes } from '../services/platform.js';
import { parseEpubFileLazy, parseCbzFileLazy, parseTxtFile, buildImageFolderBooks } from '../services/parsers.js';
import { makeFileSource, makeFolderSource } from '../services/restore.js';
import { showToast } from './useToast.js';

let quotaWarned = false;

// 移动端原文件会整份落盘，配额比桌面更容易吃满，导入后检查一次
async function warnIfStorageTight() {
  if (quotaWarned) return;
  const info = await HomuraStore.estimateStorage();
  if (!info || !info.quota) return;
  const free = info.quota - info.usage;
  if (info.ratio >= 0.85 || free < 200 * 1024 * 1024) {
    quotaWarned = true;
    showToast(`存储空间紧张：已用 ${formatBytes(info.usage)} / ${formatBytes(info.quota)}，建议清理书架或移除不看的作品`);
  }
}

export function useImporter() {
  const shelf = useShelfStore();

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(f => !f.name.startsWith('.'));
    if (files.length === 0) return;

    let importedCount = 0;
    const persistTasks = [];
    const addBook = (book, source) => {
      importedCount++;
      // addBook 内部先同步入架再落盘，这里收集落盘 Promise
      persistTasks.push(shelf.addBook(book, source));
    };

    const epubFiles = files.filter(f => /\.epub$/i.test(f.name));
    for (const epubFile of epubFiles) {
      const book = await parseEpubFileLazy(epubFile);
      if (book) addBook(book, makeFileSource(epubFile));
    }

    const archiveFiles = files.filter(f => /\.(cbz|zip)$/i.test(f.name));
    for (const archiveFile of archiveFiles) {
      const book = await parseCbzFileLazy(archiveFile);
      if (book) addBook(book, makeFileSource(archiveFile));
    }

    const txtFiles = files.filter(f => /\.(txt|md)$/i.test(f.name));
    for (const txtFile of txtFiles) {
      const book = await parseTxtFile(txtFile);
      if (book) addBook(book, makeFileSource(txtFile));
    }

    const imgFiles = files.filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(f.name));
    for (const group of buildImageFolderBooks(imgFiles)) {
      addBook(group.book, makeFolderSource(group.folderName, group.files));
    }

    // 先确保写盘完成，避免导入后立刻关闭页面导致存档丢失
    await Promise.allSettled(persistTasks);

    if (importedCount > 0) {
      showToast(`已秒速添加 ${importedCount} 部作品到书架`);
      await warnIfStorageTight();
    } else {
      showToast('未找到支持的漫画或小说格式 (.epub / .cbz / .zip / .txt / 图片)');
    }
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
        showToast('正在扫描文件夹内容...');
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
    else showToast('该文件夹内没有可导入的文件');
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
