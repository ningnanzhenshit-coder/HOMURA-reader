/* ============================================================================
   HOMURA · 导入引擎（Composable）
   ----------------------------------------------------------------------------
   文件选择、文件夹选择、拖拽导入，以及 File System Access 句柄采集。
   ========================================================================== */

import { useShelfStore } from '../stores/shelf.js';
import { useDuplicateImport } from './useDuplicateImport.js';
import { useShelfDialogs } from './useShelfDialogs.js';
import { planFolderCollections, availableCollectionName, collectionNameError } from '../services/collections.js';
import { findSameTitleBook, normalizeBookTitle } from '../services/bookTitles.js';
import { HomuraStore } from '../services/storage.js';
import { formatBytes, isAndroid } from '../services/platform.js';
import { parseCbzFileLazy, parseTxtFile, parseMobiFileLazy, parseMarkdownFile, parsePdfFileLazy, buildImageFolderBooks, discardParsedBook, isJunkImagePath } from '../services/parsers.js';
import { makeEpubId, parseEpubFile } from '../services/epubParser.js';
import {
  makeFileSource,
  makeFolderSource,
  stageNativeFileSource,
  stageNativePathSource
} from '../services/restore.js';
import { canUseNativeArchive, releaseNativeArchiveSession } from '../services/nativeArchive.js';
import { removeNativeBookDir } from '../services/nativeStorage.js';
import {
  isNativeImportFile,
  makeNativeImportFile,
  materializeNativeImportFile,
  materializeStagedNativeImportFile,
  pickNativeImportPaths,
  scanNativeImportPaths,
  shouldFallbackNativeImport
} from '../services/nativeImport.js';
import { createCoverThumbnail } from '../services/coverThumb.js';
import { runShelfMutation } from '../services/mutationQueue.js';

let quotaWarned = false;
const IMPORT_TIMING_ENABLED = !!import.meta.env?.DEV;
const LARGE_FILE_BYTES = 64 * 1024 * 1024;
const VERY_LARGE_FILE_BYTES = 256 * 1024 * 1024;
const DESKTOP_IMPORT_CONCURRENCY = 4;
const ANDROID_IMPORT_CONCURRENCY = 2;

const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? () => performance.now()
  : () => Date.now();

function importTitleFromFileName(name) {
  return String(name || '')
    .replace(/(\.kepub)?\.epub$/i, '')
    .replace(/\.[^.]+$/, '');
}

function createImportMetrics(files, tasks) {
  return {
    files: files.length,
    tasks: tasks.length,
    importTasks: tasks.length,
    concurrency: 1,
    saved: 0,
    skipped: 0,
    failed: 0,
    parseFailed: 0,
    nativeTasks: tasks.filter(task => (
      isNativeImportFile(task.file)
      || (task.group?.files || []).some(file => isNativeImportFile(file))
    )).length,
    stageMs: 0,
    nativeStageMs: 0,
    readMs: 0,
    parseMs: 0,
    coverMs: 0,
    idbMs: 0,
    sqliteMs: 0,
    commitMs: 0,
    startedAt: now()
  };
}

function logImportMetrics(metrics, savedCount) {
  if (!IMPORT_TIMING_ENABLED) return;
  // 阶段耗时是各任务耗时之和，并发导入时会大于实际 wall time。
  const payload = {
    files: metrics.files,
    tasks: metrics.tasks,
    importTasks: metrics.importTasks,
    concurrency: metrics.concurrency,
    saved: savedCount,
    skipped: metrics.skipped,
    failed: metrics.failed,
    parseFailed: metrics.parseFailed,
    nativeTasks: metrics.nativeTasks,
    totalMs: Math.round(now() - metrics.startedAt),
    stageMs: Math.round(metrics.stageMs),
    nativeStageMs: Math.round(metrics.nativeStageMs),
    readMs: Math.round(metrics.readMs),
    parseMs: Math.round(metrics.parseMs),
    coverMs: Math.round(metrics.coverMs),
    idbMs: Math.round(metrics.idbMs),
    sqliteMs: Math.round(metrics.sqliteMs),
    commitMs: Math.round(metrics.commitMs)
  };
  console.info('[HOMURA][import] 批次耗时', payload);
}

function buildImportTasks(files) {
  const tasks = [];
  const addFileTasks = (list, kind, titleIsReliable = true) => {
    for (const file of list) {
      tasks.push({
        kind,
        file,
        title: importTitleFromFileName(file.name),
        titleIsReliable,
        size: file.size || 0
      });
    }
  };

  // EPUB / MOBI 的书名来自容器元数据，不能拿文件名直接断定同名。
  addFileTasks(files.filter(f => /\.epub$/i.test(f.name)), 'epub', false);
  addFileTasks(files.filter(f => /\.pdf$/i.test(f.name)), 'pdf');
  addFileTasks(files.filter(f => /\.(cbz|zip)$/i.test(f.name)), 'archive');
  addFileTasks(files.filter(f => /\.(mobi|prc|azw)$/i.test(f.name)), 'mobi', false);
  addFileTasks(files.filter(f => /\.md$/i.test(f.name)), 'markdown');
  addFileTasks(files.filter(f => /\.txt$/i.test(f.name)), 'txt');

  // macOS 打包留下的 __MACOSX / ._* 不是真正的页面，提前剔掉免得白读内存。
  const imgFiles = files.filter(f => f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(f.name))
    .filter(f => !isJunkImagePath(f.customRelativePath || f.webkitRelativePath || f.name));
  for (const group of buildImageFolderBooks(imgFiles)) {
    tasks.push({
      kind: 'images',
      group,
      title: group.folderName,
      titleIsReliable: true,
      size: group.files.reduce((total, file) => total + (file.size || 0), 0)
    });
  }
  return tasks;
}

function chooseImportConcurrency(tasks) {
  if (tasks.length <= 1) return 1;
  const maxSize = tasks.reduce((max, task) => Math.max(max, task.size || 0), 0);
  if (isAndroid) return maxSize > 32 * 1024 * 1024 ? 1 : ANDROID_IMPORT_CONCURRENCY;
  if (maxSize > VERY_LARGE_FILE_BYTES) return 2;
  if (maxSize > LARGE_FILE_BYTES) return 3;
  return Math.min(DESKTOP_IMPORT_CONCURRENCY, tasks.length);
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
  const { confirmDuplicate, confirmDuplicates } = useDuplicateImport();
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
    // 返回本批实际入架的书籍 id，调用方靠它判断导入结果；别把返回值吞在这里。
    const importIntoCurrent = async () => {
      const ids = await importFiles(files);
      if (ids.length && targetId && shelf.collections.some(item => item.id === targetId)) await shelf.moveBooks(ids, targetId);
      return ids;
    };
    const plan = planFolderCollections(files);
    if (plan.bookCount < 2 || (!plan.hasDirectories && (!offerCollection || targetId))) return importIntoCurrent();
    const grouping = plan.hasDirectories ? `按目录分别创建 ${plan.groups.length} 个一级书库` : '将这批作品放进一个新书库';
    const create = await askShelfDialog({
      kind: 'folder', title: '为导入内容创建书库？',
      message: `检测到 ${plan.bookCount} 本作品。可以${grouping}，也可以直接导入。`
    });
    if (create === null) return [];
    if (!create) return importIntoCurrent();
    const reserved = [...shelf.collections];
    const groups = [];
    // 所有名称确认后才导入；中途取消不会留下半批书库。
    for (const group of plan.groups) {
      const message = group.path ? `目录：${group.path} · ${group.bookCount} 本作品` : `${group.bookCount} 本作品`;
      const title = await askShelfDialog({ kind: 'name', title: '创建导入书库', message, initialName: availableCollectionName(group.title, reserved), validate: name => collectionNameError(name, reserved) });
      if (title === null) return [];
      reserved.push({ title });
      groups.push({ ...group, title });
    }
    const savedIds = [];
    for (const group of groups) {
      const ids = await importFiles(group.files);
      if (!ids.length) continue;
      savedIds.push(...ids);
      const collection = await shelf.createCollection(group.title);
      await shelf.moveBooks(ids, collection.id);
    }
    shelf.activeCollectionId = null;
    return savedIds;
  }

  // 导入前只按文件名快速识别可能的同名书，避免重复文件也走完整解析。
  async function preflightDuplicateTasks(tasks) {
    if (!tasks.length || !shelf.library.length) {
      return { tasks, skipped: 0 };
    }
    const knownByTitle = new Map();
    for (const book of shelf.library) {
      const key = normalizeBookTitle(book.title);
      if (key && !knownByTitle.has(key)) knownByTitle.set(key, book);
    }

    const groups = new Map();
    for (const task of tasks) {
      if (!task.titleIsReliable) continue;
      const key = normalizeBookTitle(task.title);
      const existing = key ? knownByTitle.get(key) : null;
      if (!existing) continue;
      let group = groups.get(key);
      if (!group) {
        group = { key, title: task.title, existingTitle: existing.title, tasks: [] };
        groups.set(key, group);
      }
      group.tasks.push(task);
    }
    if (!groups.size) return { tasks, skipped: 0 };

    const list = [...groups.values()];
    const keep = await confirmDuplicates(list.map(group => ({
      title: group.title,
      existingTitle: group.existingTitle,
      count: group.tasks.length
    })));
    if (keep) {
      // 只对参与预检的任务免掉后续同名弹窗；其它格式的真实书名仍要单独判断。
      for (const group of list) {
        for (const task of group.tasks) task.duplicateApprovedTitleKey = group.key;
      }
      return { tasks, skipped: 0 };
    }

    const skippedTasks = new Set(list.flatMap(group => group.tasks));
    for (const task of skippedTasks) {
      if (task.kind === 'images' && task.group?.book) await discardParsedBook(task.group.book);
    }
    return {
      tasks: tasks.filter(task => !skippedTasks.has(task)),
      skipped: skippedTasks.size
    };
  }

  async function prepareEpubTask(task, metrics) {
    let file = task.file;
    const bookId = makeEpubId();
    let source = makeFileSource(file);
    let nativePath = '';

    // 原生 EPUB 先流式落到 AppData。解析只读 spine 文本和封面，
    // 大画集不再把整个压缩包搬进 WebView 内存。
    if (canUseNativeArchive()) {
      const started = now();
      const viaNativePath = isNativeImportFile(file);
      try {
        const staged = viaNativePath
          ? await stageNativePathSource(bookId, file)
          : await stageNativeFileSource(bookId, file);
        source = staged;
        nativePath = staged.nativePath;
        if (viaNativePath) metrics.nativeStageMs += now() - started;
      } catch (err) {
        if (!shouldFallbackNativeImport(err)) {
          console.warn('[HOMURA] 原生 EPUB 预存被拒绝', err);
          // 安全 / 超限拒绝不会进入回退分支，已经写了一半的 AppData 目录同样要回收，
          // 否则会留下没有书目指向的孤儿文件。
          await removeNativeBookDir(bookId).catch(() => {});
          return null;
        }
        console.warn('[HOMURA] 原生 EPUB 预存失败，沿用 JSZip', err);
        await removeNativeBookDir(bookId).catch(() => {});
        if (isNativeImportFile(file)) {
          const readStarted = now();
          try {
            file = await materializeNativeImportFile(file);
          } catch (readError) {
            console.warn('[HOMURA] 读取原生 EPUB 失败', readError);
            return null;
          } finally {
            metrics.readMs += now() - readStarted;
          }
          source = makeFileSource(file);
        }
      } finally {
        metrics.stageMs += now() - started;
      }
    }

    const parseStarted = now();
    let book = null;
    try {
      book = await parseEpubFile(file, {
        id: bookId,
        name: file.name,
        nativePath,
        loadFallbackFile: nativePath
          ? () => materializeStagedNativeImportFile(file, nativePath)
          : undefined
      });
    } catch (err) {
      console.warn('[HOMURA] EPUB 解析失败', err);
    } finally {
      metrics.parseMs += now() - parseStarted;
    }
    if (!book) {
      if (nativePath) await removeNativeBookDir(bookId).catch(() => {});
      return null;
    }
    book.nativeArchiveStaged = !!nativePath;
    return { book, source };
  }

  async function prepareArchiveTask(task, metrics) {
    let file = task.file;
    const bookId = `cbz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let source = makeFileSource(file);
    let nativePath = '';

    // 先把原文件流式落到 AppData，再让原生后端从路径随机读取；
    // 这样不会先用 JSZip 把整本压缩包读进 WebView。
    if (canUseNativeArchive()) {
      const started = now();
      const viaNativePath = isNativeImportFile(file);
      try {
        const staged = viaNativePath
          ? await stageNativePathSource(bookId, file)
          : await stageNativeFileSource(bookId, file);
        source = staged;
        nativePath = staged.nativePath;
        if (viaNativePath) metrics.nativeStageMs += now() - started;
      } catch (err) {
        if (!shouldFallbackNativeImport(err)) {
          console.warn('[HOMURA] 原生压缩包预存被拒绝', err);
          // 同上：被安全规则拒绝时不会回退，必须顺手清掉半成品目录。
          await removeNativeBookDir(bookId).catch(() => {});
          return null;
        }
        console.warn('[HOMURA] 原生压缩包预存失败，沿用 JSZip', err);
        await removeNativeBookDir(bookId).catch(() => {});
        if (isNativeImportFile(file)) {
          const readStarted = now();
          try {
            file = await materializeNativeImportFile(file);
          } catch (readError) {
            console.warn('[HOMURA] 读取原生压缩包失败', readError);
            return null;
          } finally {
            metrics.readMs += now() - readStarted;
          }
          source = makeFileSource(file);
        }
      } finally {
        metrics.stageMs += now() - started;
      }
    }

    const parseStarted = now();
    let book = null;
    try {
      book = await parseCbzFileLazy(file, {
        id: bookId,
        name: file.name,
        nativePath,
        staged: !!nativePath,
        loadFallbackFile: nativePath
          ? () => materializeStagedNativeImportFile(file, nativePath)
          : undefined
      });
    } catch (err) {
      console.warn('[HOMURA] 压缩包解析失败', err);
    } finally {
      metrics.parseMs += now() - parseStarted;
    }
    if (!book) {
      if (nativePath) await removeNativeBookDir(bookId).catch(() => {});
      return null;
    }
    book.nativeArchiveStaged = !!nativePath;
    return { book, source };
  }

  async function prepareParsedTask(task, parser, metrics, label) {
    const started = now();
    let file = task.file;
    let book = null;
    try {
      if (isNativeImportFile(file)) {
        const readStarted = now();
        try {
          file = await materializeNativeImportFile(file);
        } finally {
          metrics.readMs += now() - readStarted;
        }
      }
      book = await parser(file);
    } catch (err) {
      console.warn(`[HOMURA] ${label} 解析失败`, err);
    } finally {
      metrics.parseMs += now() - started;
    }
    if (!book) return null;
    return { book, source: makeFileSource(file) };
  }

  async function prepareImportTask(task, metrics) {
    let prepared = null;
    if (task.kind === 'epub') prepared = await prepareEpubTask(task, metrics);
    else if (task.kind === 'archive') prepared = await prepareArchiveTask(task, metrics);
    else if (task.kind === 'pdf') prepared = await prepareParsedTask(task, parsePdfFileLazy, metrics, 'PDF');
    else if (task.kind === 'mobi') prepared = await prepareParsedTask(task, parseMobiFileLazy, metrics, 'MOBI');
    else if (task.kind === 'markdown') prepared = await prepareParsedTask(task, parseMarkdownFile, metrics, 'Markdown');
    else if (task.kind === 'txt') prepared = await prepareParsedTask(task, parseTxtFile, metrics, 'TXT');
    else if (task.kind === 'images') {
      let group = task.group;
      if (group?.files?.some(file => isNativeImportFile(file))) {
        const readStarted = now();
        try {
          const files = [];
          for (const file of group.files) {
            files.push(await materializeNativeImportFile(file));
          }
          const rebuilt = buildImageFolderBooks(files)[0];
          if (!rebuilt) throw new Error('图片目录为空');
          group = rebuilt;
        } catch (err) {
          console.warn('[HOMURA] 读取原生图片目录失败', err);
          return null;
        } finally {
          metrics.readMs += now() - readStarted;
        }
      }
      prepared = {
        book: group.book,
        source: makeFolderSource(group.folderName, group.files)
      };
    }
    if (!prepared) {
      metrics.parseFailed++;
      return null;
    }

    const coverStarted = now();
    prepared.coverThumb = await createCoverThumbnail(prepared.book.coverBlob).catch(() => null);
    metrics.coverMs += now() - coverStarted;
    return prepared;
  }

  async function commitPreparedBook(prepared, task, savedBooks, metrics) {
    const { book, source, coverThumb } = prepared;
    const titleKey = normalizeBookTitle(book.title);
    const existingBook = findSameTitleBook(shelf.library, book.title);
    if (existingBook && task?.duplicateApprovedTitleKey !== titleKey) {
      if (!(await confirmDuplicate(book, existingBook))) {
        metrics.skipped++;
        await discardParsedBook(book);
        return null;
      }
    }

    const started = now();
    try {
      // 提交仍然串行：下一本的同名检测必须能看到这一批已保存的书。
      await shelf.addBook(book, source, { coverThumb, timing: metrics });
      savedBooks.push(book);
      metrics.saved++;
      await releaseNativeArchiveSession(book);
      book.nativeArchiveStaged = false;
      metrics.commitMs += now() - started;
      return book;
    } catch (err) {
      metrics.failed++;
      console.warn('[HOMURA] 本地存档写入失败，已跳过', book.title, err);
      await discardParsedBook(book);
      metrics.commitMs += now() - started;
      return null;
    }
  }

  async function importFiles(files) {
    const tasks = buildImportTasks(files);
    const metrics = createImportMetrics(files, tasks);
    if (!tasks.length) {
      console.warn('[HOMURA] 未找到支持的漫画或小说格式');
      logImportMetrics(metrics, 0);
      return [];
    }

    const preflight = await preflightDuplicateTasks(tasks);
    const importTasks = preflight.tasks;
    metrics.skipped += preflight.skipped;
    metrics.importTasks = importTasks.length;
    if (!importTasks.length) {
      logImportMetrics(metrics, 0);
      return [];
    }

    const savedBooks = [];
    metrics.concurrency = chooseImportConcurrency(importTasks);
    for (let start = 0; start < importTasks.length; start += metrics.concurrency) {
      const chunk = importTasks.slice(start, start + metrics.concurrency);
      const prepared = await Promise.all(chunk.map(task => prepareImportTask(task, metrics)));
      for (let index = 0; index < prepared.length; index++) {
        if (prepared[index]) await commitPreparedBook(prepared[index], chunk[index], savedBooks, metrics);
      }
    }

    if (metrics.failed > 0) {
      console.warn(`[HOMURA] ${metrics.failed} 部作品未能保存到本地存档`);
    } else if (savedBooks.length === 0 && metrics.skipped === 0) {
      console.warn('[HOMURA] 未找到支持的漫画或小说格式');
    }
    if (savedBooks.length > 0) await warnIfStorageTight();
    logImportMetrics(metrics, savedBooks.length);
    return savedBooks.map(book => book.id);
  }

  // ---- 拖拽：递归遍历 webkitGetAsEntry 目录树 ----

  function traverseFileTree(item, path, outList) {
    return new Promise(resolve => {
      // __MACOSX 整个目录跳过，里面的 ._* 只是资源分叉，读进来也叫不醒。
      if (item.name === '__MACOSX') {
        resolve();
        return;
      }
      if (item.isFile) {
        item.file(file => {
          // 隐藏文件和 macOS 资源分叉文件不参与导入。
          if (file.name.startsWith('.') || isJunkImagePath(path + file.name)) {
            resolve();
            return;
          }
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

  // 桌面 Tauri 优先用系统选择器拿真实路径；真正的大文件由 Rust 直接复制。
  async function pickNativeFiles(options) {
    const paths = await pickNativeImportPaths({ directory: false, multiple: true });
    if (!paths || paths.length === 0) return false;
    const entries = await scanNativeImportPaths(paths);
    const files = entries.map(makeNativeImportFile);
    if (files.length === 0) {
      console.warn('[HOMURA] 所选路径里没有可导入的支持格式');
      return true;
    }
    await handleFiles(files, options);
    return true;
  }

  async function pickNativeFolder() {
    const paths = await pickNativeImportPaths({ directory: true, multiple: false, title: '导入文件夹' });
    if (!paths || paths.length === 0) return false;
    const entries = await scanNativeImportPaths(paths);
    const files = entries.map(makeNativeImportFile);
    if (files.length === 0) {
      console.warn('[HOMURA] 该文件夹内没有可导入的文件');
      return true;
    }
    await handleFiles(files);
    return true;
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
      if (name.startsWith('.') || name === '__MACOSX') continue;
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
    pickFolderViaFSA,
    pickNativeFiles,
    pickNativeFolder
  };
}
