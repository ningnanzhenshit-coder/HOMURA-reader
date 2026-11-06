/* ============================================================================
   HOMURA · 格式解析
   ----------------------------------------------------------------------------
   EPUB / CBZ / ZIP / TXT / Markdown / PDF 的懒加载解析，统一输出书架可用的
   书籍对象；以及把散装图片按文件夹分组生成漫画书的 buildImageFolderBooks。
   ========================================================================== */

import JSZip from 'jszip';
import { escapeHtml } from './utils.js';
import { decodeTxtBytes } from './textEncoding.js';
import { renderMarkdown } from './markdown.js';
import { parseMobiBuffer } from './mobi.js';
import { openPdfDocument, createPdfPageItems, renderPdfCoverBlob, forgetPdfPageUrls } from './pdf.js';
import { parseEpubFile } from './epubParser.js';
import {
  canUseNativeArchive,
  clearNativeArchiveBookCache,
  closeNativeArchive,
  openNativeArchive,
  readNativePageBlob
} from './nativeArchive.js';
import { removeNativeBookDir } from './nativeStorage.js';

// 撤销页面资源，不触碰已经由存储层管理的原始文件。
export async function releaseBookMedia(book) {
  if (!book) return;
  const revoke = url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); };
  const urls = new Set([book.cover, book.originalCover, ...(book.resourceUrls || [])]);
  for (const page of book.pageItems || []) {
    urls.add(page.url);
    const pending = page.archiveTask || page.renderTask;
    if (pending) pending.then(revoke, () => {});
  }
  urls.forEach(revoke);
  if (book.pdfDoc) {
    try {
      await book.pdfDoc.loadingTask.destroy();
    } catch (err) {
      console.warn('[HOMURA] 释放 PDF 失败', err);
    } finally {
      forgetPdfPageUrls(book.pageItems);
    }
  }
}

// 同名书被跳过时还未入架，原生暂存文件也需要回收。
export async function discardParsedBook(book) {
  await releaseBookMedia(book);
  if (book.nativeArchiveId) {
    await closeNativeArchive(book.nativeArchiveId).catch(() => {});
    await clearNativeArchiveBookCache(book.nativeArchiveId).catch(() => {});
  }
  if (book.nativeArchiveStaged) {
    await removeNativeBookDir(book.id).catch(() => {});
  }
}

// ---- EPUB 解析：章节正文 + 图片型 EPUB 自动转漫画 ----
// ---- CBZ / ZIP 解析：压缩包内图片按自然序排列 ----
// ---- TXT / Markdown 解析：按章节标题切分 ----

export async function parseEpubFileLazy(file, options = {}) {
  try {
    return await parseEpubFile(file, options);
  } catch (err) {
    console.error(err);
    return null;
  }
}

// Android 原生快速路径：压缩包只打开一次，页面按需解出到 AppCache。
export async function parseCbzNativeArchive(nativePath, options = {}) {
  if (!canUseNativeArchive() || !nativePath) return null;
  const archiveId = options.id
    || `cbz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const name = options.name || 'book.cbz';
  let coverUrl = null;

  try {
    const archive = await openNativeArchive(archiveId, nativePath);
    const entries = archive?.entries || [];
    if (!entries.length) throw new Error('压缩包内未找到图片');

    const first = await readNativePageBlob(archiveId, 0);
    coverUrl = URL.createObjectURL(first.blob);
    const pageItems = entries.map((entry, index) => ({
      nativeArchiveId: archiveId,
      nativeIndex: index,
      url: index === 0 ? coverUrl : null
    }));

    return {
      id: archiveId,
      type: 'manga',
      format: 'cbz',
      title: name.replace(/\.(cbz|zip)$/i, ''),
      cover: coverUrl,
      coverBlob: first.blob,
      pageItems,
      pageCount: pageItems.length,
      nativeArchiveId: archiveId,
      nativeArchivePath: nativePath,
      nativeArchiveMode: 'pages',
      nativeArchiveStaged: !!options.staged
    };
  } catch (err) {
    if (coverUrl?.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
    await closeNativeArchive(archiveId).catch(() => {});
    await clearNativeArchiveBookCache(archiveId).catch(() => {});
    throw err;
  }
}

export async function parseCbzFileLazy(file, options = {}) {
  const id = options.id
    || `cbz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const name = options.name || file?.name || 'book.cbz';

  if (options.nativePath && canUseNativeArchive()) {
    try {
      return await parseCbzNativeArchive(options.nativePath, {
        ...options,
        id,
        name
      });
    } catch (err) {
      console.warn('[HOMURA] Android 原生压缩包解析失败，回退 JSZip', err);
    }
  }
  if (!file) return null;

  try {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(file);
    const imgEntries = [];

    zipContent.forEach((relPath, entry) => {
      if (!entry.dir && /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(relPath) && !relPath.includes('__MACOSX')) {
        imgEntries.push({ name: relPath, entry });
      }
    });

    imgEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (imgEntries.length === 0) throw new Error('压缩包内未找到图片');

    const firstBlob = await imgEntries[0].entry.async('blob');
    const firstUrl = URL.createObjectURL(firstBlob);

    const pageItems = imgEntries.map((item, idx) => ({
      zipEntry: item.entry,
      url: idx === 0 ? firstUrl : null
    }));

    const title = name.replace(/\.(cbz|zip)$/i, '');
    return {
      id,
      type: 'manga',
      format: 'cbz',
      title: title,
      cover: firstUrl,
      coverBlob: firstBlob,
      pageItems: pageItems,
      pageCount: pageItems.length,
      nativeArchiveStaged: !!options.staged
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

// ---- PDF：每页按需渲染成位图，直接复用漫画渲染管道 ----

export async function parsePdfFileLazy(file) {
  try {
    const pdfDoc = await openPdfDocument(file);
    const pageCount = pdfDoc.numPages || 0;
    if (pageCount === 0) throw new Error('PDF 中没有可显示的页面');

    const coverBlob = await renderPdfCoverBlob(pdfDoc);
    const coverUrl = URL.createObjectURL(coverBlob);

    return {
      id: 'pdf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'manga',
      format: 'pdf',
      title: file.name.replace(/\.pdf$/i, ''),
      cover: coverUrl,
      coverBlob: coverBlob,
      pdfDoc: pdfDoc,
      pageItems: createPdfPageItems(pdfDoc, pageCount),
      pageCount: pageCount
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function parseTxtFile(txtFile) {
  try {
    const rawText = decodeTxtBytes(await txtFile.arrayBuffer());
    const lines = rawText.split(/\r\n?|\n/).map(l => l.trim()).filter(Boolean);
    const title = txtFile.name.replace(/\.[^.]+$/, '');
    const chapters = [];
    let currentChapTitle = '开始';
    let currentParagraphs = [];
    const chapterRegex = /^(第[0-9零一二三四五六七八九十百千万]+[章节卷回话]|Chapter\s*\d+|序[章言]?|楔子|终章|尾声)/i;

    for (const line of lines) {
      if (line.length < 40 && chapterRegex.test(line)) {
        if (currentParagraphs.length > 0) {
          chapters.push({ title: currentChapTitle, htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('') });
          currentParagraphs = [];
        }
        currentChapTitle = line;
      } else {
        currentParagraphs.push(line);
        if (currentParagraphs.length >= 60) {
          chapters.push({ title: currentChapTitle, htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('') });
          currentParagraphs = [];
        }
      }
    }
    if (currentParagraphs.length > 0) {
      chapters.push({ title: currentChapTitle, htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('') });
    }
    if (chapters.length === 0) chapters.push({ title, htmlContent: '<p>（空文件）</p>' });

    return {
      id: 'txt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'novel',
      format: 'txt',
      title,
      cover: null,
      coverBlob: null,
      chapters,
      pageCount: chapters.length
    };
  } catch (err) {
    console.warn('[HOMURA] TXT 文件读取失败', err);
    return null;
  }
}

// ---- Markdown：按一/二级标题切章，正文交给 marked 转 HTML ----

function stripMarkdownTitle(line) {
  return line.replace(/[*_`]/g, '').trim();
}

function splitMarkdownChapters(text, fallbackTitle) {
  const chapters = [];
  let buffer = [];
  let fence = '';
  let currentTitle = null;

  const flush = title => {
    const html = renderMarkdown(buffer.join('\n')).trim();
    buffer = [];
    if (!html) return;
    chapters.push({
      title: title || '开始',
      htmlContent: html
    });
  };

  for (const line of text.split('\n')) {
    // 代码块里的 # 不算标题
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = '';
    }
    if (!fence) {
      const heading = line.match(/^(#{1,2})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flush(currentTitle);
        currentTitle = stripMarkdownTitle(heading[2]) || currentTitle;
        continue;
      }
    }
    buffer.push(line);
  }
  flush(currentTitle);

  if (chapters.length === 0) {
    chapters.push({ title: fallbackTitle, htmlContent: '<p>（空文件）</p>' });
  }
  return chapters;
}

export function parseMarkdownFile(mdFile) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const rawText = String(e.target.result || '').replace(/\r\n?/g, '\n');
      const title = mdFile.name.replace(/\.[^.]+$/, '');
      const chapters = splitMarkdownChapters(rawText, title);

      resolve({
        id: 'md_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'novel',
        format: 'markdown',
        title: title,
        cover: null,
        coverBlob: null,
        chapters: chapters,
        pageCount: chapters.length
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(mdFile, 'utf-8');
  });
}

// ---- MOBI：纯图走漫画管道，带正文的作品仍按小说排版 ----

export async function parseMobiFileLazy(file, onProgress) {
  try {
    const fallbackTitle = file.name.replace(/\.(mobi|prc|azw)$/i, '');
    let bytes;
    if (onProgress && file.size) {
      bytes = new Uint8Array(file.size);
      let offset = 0;
      await file.stream().pipeTo(new WritableStream({
        write(chunk) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
          onProgress(offset / bytes.length);
        }
      }));
    } else {
      bytes = await file.arrayBuffer();
    }
    const data = parseMobiBuffer(bytes, fallbackTitle);
    const coverUrl = data.coverBlob ? URL.createObjectURL(data.coverBlob) : null;

    return {
      id: 'mobi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: data.pageItems ? 'manga' : 'novel',
      format: 'mobi',
      title: data.title,
      cover: coverUrl,
      coverBlob: data.coverBlob,
      ...(data.pageItems ? { pageItems: data.pageItems } : { chapters: data.chapters }),
      resourceUrls: data.resourceUrls,
      pageCount: (data.pageItems || data.chapters).length
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

// 把散装图片按所在文件夹分组，每组生成一本书
export function buildImageFolderBooks(imgFiles) {
  if (!imgFiles || imgFiles.length === 0) return [];
  const folderGroups = new Map();
  imgFiles.forEach(f => {
    const rel = f.customRelativePath || f.webkitRelativePath || '';
    const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
    let groupName = '本地漫画图集';
    if (parts.length >= 2) {
      groupName = parts[parts.length - 2];
    } else if (imgFiles.length === 1) {
      groupName = f.name.replace(/\.[^.]+$/, '');
    }
    const folderPath = parts.slice(0, -1).join('/');
    if (!folderGroups.has(folderPath)) folderGroups.set(folderPath, { folderName: groupName, files: [] });
    folderGroups.get(folderPath).files.push(f);
  });

  return [...folderGroups.values()].map(({ folderName, files: groupImgs }) => {
    groupImgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const firstCoverUrl = URL.createObjectURL(groupImgs[0]);
    const pageItems = groupImgs.map((fileObj, idx) => ({
      file: fileObj,
      url: idx === 0 ? firstCoverUrl : null
    }));
    return {
      folderName,
      files: groupImgs,
      book: {
        id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type: 'manga',
        format: 'images',
        title: folderName,
        cover: firstCoverUrl,
        coverBlob: groupImgs[0],
        pageItems: pageItems,
        pageCount: pageItems.length
      }
    };
  });
}
