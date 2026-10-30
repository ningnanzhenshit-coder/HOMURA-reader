/* ============================================================================
   HOMURA · 格式解析
   ----------------------------------------------------------------------------
   EPUB / CBZ / ZIP / TXT / Markdown / PDF 的懒加载解析，统一输出书架可用的
   书籍对象；以及把散装图片按文件夹分组生成漫画书的 buildImageFolderBooks。
   ========================================================================== */

import JSZip from 'jszip';
import { showToast } from '../composables/useToast.js';
import { escapeHtml } from './utils.js';
import { renderMarkdown } from './markdown.js';
import { parseMobiBuffer, mobiErrorText } from './mobi.js';
import { openPdfDocument, createPdfPageItems, renderPdfCoverBlob } from './pdf.js';


// ---- EPUB 内部相对路径解析 ----

function resolveRelativePath(basePath, relativePath) {
  const baseDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/') + 1) : '';
  const stack = baseDir.split('/').filter(Boolean);
  const parts = relativePath.split('/');
  for (const p of parts) {
    if (p === '..') stack.pop();
    else if (p !== '.' && p !== '') stack.push(p);
  }
  return stack.join('/');
}

// ---- EPUB 解析：章节正文 + 图片型 EPUB 自动转漫画 ----
// ---- CBZ / ZIP 解析：压缩包内图片按自然序排列 ----
// ---- TXT / Markdown 解析：按章节标题切分 ----

export async function parseEpubFileLazy(file) {
  try {
    showToast(`正在快速索引《${file.name}》...`);
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(file);

    const containerFile = zipContent.file('META-INF/container.xml');
    if (!containerFile) throw new Error('缺少 META-INF/container.xml');
    const containerXml = await containerFile.async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'text/xml');
    const rootfileEl = containerDoc.querySelector('rootfile');
    const opfPath = rootfileEl ? rootfileEl.getAttribute('full-path') : 'content.opf';
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    const opfFile = zipContent.file(opfPath);
    if (!opfFile) throw new Error('未找到 OPF 配置文件');
    const opfText = await opfFile.async('text');
    const opfDoc = parser.parseFromString(opfText, 'text/xml');

    const titleEl = opfDoc.querySelector('title, dc\\:title');
    const bookTitle = titleEl ? titleEl.textContent.trim() : file.name.replace(/(\.kepub)?\.epub$/i, '');

    const manifest = {};
    opfDoc.querySelectorAll('manifest > item').forEach(item => {
      manifest[item.getAttribute('id')] = {
        href: item.getAttribute('href'),
        mediaType: item.getAttribute('media-type') || ''
      };
    });

    const spineIds = [];
    opfDoc.querySelectorAll('spine > itemref').forEach(ref => {
      spineIds.push(ref.getAttribute('idref'));
    });

    const lazyMangaEntries = [];
    const seenGlobalPaths = new Set();
    const chapters = [];
    let imageHeavyCount = 0;

    for (const idref of spineIds) {
      const item = manifest[idref];
      if (!item) continue;
      const fullPath = opfDir + decodeURIComponent(item.href);
      const entry = zipContent.file(fullPath) || zipContent.file(item.href);
      if (!entry) continue;

      const rawHtml = await entry.async('text');
      const htmlDoc = parser.parseFromString(rawHtml, 'text/html');
      const imgs = htmlDoc.querySelectorAll('img, image');
      const foundEntriesInPage = [];
      const seenInCurrentPage = new Set();

      for (const img of imgs) {
        const srcAttr = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href');
        if (srcAttr && !srcAttr.startsWith('http') && !srcAttr.startsWith('data:')) {
          const cleanSrc = decodeURIComponent(srcAttr.split('#')[0]);
          const resolved = resolveRelativePath(fullPath, cleanSrc);
          const imgEntry = zipContent.file(resolved) || zipContent.file(cleanSrc);
          if (imgEntry) {
            img.setAttribute('data-zip-path', imgEntry.name);
            if (!seenInCurrentPage.has(imgEntry.name)) {
              seenInCurrentPage.add(imgEntry.name);
              foundEntriesInPage.push(imgEntry);
            }
          }
        }
      }

      const plainText = (htmlDoc.body?.textContent || '').trim();
      if (foundEntriesInPage.length > 0 && plainText.length < 60) {
        imageHeavyCount++;
        foundEntriesInPage.forEach(ent => {
          if (!seenGlobalPaths.has(ent.name)) {
            seenGlobalPaths.add(ent.name);
            lazyMangaEntries.push({ zipEntry: ent, url: null });
          }
        });
      }

      const chapterHeading = htmlDoc.querySelector('h1, h2, h3, title')?.textContent?.trim()
        || item.href.split('/').pop().replace(/\.[^.]+$/, '');
      const bodyHtml = htmlDoc.body ? htmlDoc.body.innerHTML.trim() : rawHtml;

      if (bodyHtml.length > 0) {
        chapters.push({
          title: chapterHeading,
          htmlContent: bodyHtml
        });
      }
    }

    const isMangaEpub = imageHeavyCount > 0 && (imageHeavyCount >= chapters.length * 0.45 || lazyMangaEntries.length >= 6);

    if (isMangaEpub && lazyMangaEntries.length > 0) {
      const firstBlob = await lazyMangaEntries[0].zipEntry.async('blob');
      const coverUrl = URL.createObjectURL(firstBlob);
      lazyMangaEntries[0].url = coverUrl;

      return {
        id: 'epub_manga_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'manga',
        title: bookTitle,
        cover: coverUrl,
        coverBlob: firstBlob,
        pageItems: lazyMangaEntries,
        pageCount: lazyMangaEntries.length
      };
    }

    if (chapters.length === 0) throw new Error('未能提取出有效章节内容');

    let coverUrl = null;
    let coverBlob = null;
    if (lazyMangaEntries.length > 0) {
      coverBlob = await lazyMangaEntries[0].zipEntry.async('blob');
      coverUrl = URL.createObjectURL(coverBlob);
    }

    return {
      id: 'epub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'epub',
      title: bookTitle,
      cover: coverUrl,
      coverBlob: coverBlob,
      zipContent: zipContent,
      chapters: chapters,
      pageCount: chapters.length
    };
  } catch (err) {
    console.error(err);
    showToast('EPUB 解析失败：' + err.message);
    return null;
  }
}

export async function parseCbzFileLazy(file) {
  try {
    showToast(`正在快速索引压缩包《${file.name}》...`);
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

    const title = file.name.replace(/\.(cbz|zip)$/i, '');
    return {
      id: 'cbz_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'manga',
      title: title,
      cover: firstUrl,
      coverBlob: firstBlob,
      pageItems: pageItems,
      pageCount: pageItems.length
    };
  } catch (err) {
    console.error(err);
    showToast('压缩包解析失败：' + err.message);
    return null;
  }
}

// ---- PDF：每页按需渲染成位图，直接复用漫画渲染管道 ----

function pdfErrorText(err) {
  if (err && err.name === 'PasswordException') return '该 PDF 已加密，暂不支持需要密码的文件';
  if (err && err.name === 'InvalidPDFException') return 'PDF 文件已损坏或格式不合法';
  return 'PDF 解析失败：' + (err && err.message ? err.message : '未知错误');
}

export async function parsePdfFileLazy(file) {
  try {
    showToast(`正在解析 PDF《${file.name}》...`);
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
    showToast(pdfErrorText(err));
    return null;
  }
}

export function parseTxtFile(txtFile) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const rawText = e.target.result || '';
      const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const title = txtFile.name.replace(/\.[^.]+$/, '');

      const chapters = [];
      let currentChapTitle = title + ' · 开始';
      let currentParagraphs = [];
      const chapterRegex = /^(第[0-9零一二三四五六七八九十百千万]+[章节卷回话]|Chapter\s*\d+|序[章言]?|楔子|终章|尾声)/i;

      for (const line of lines) {
        if (line.length < 40 && chapterRegex.test(line)) {
          if (currentParagraphs.length > 0) {
            chapters.push({
              title: currentChapTitle,
              htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')
            });
            currentParagraphs = [];
          }
          currentChapTitle = line;
        } else {
          currentParagraphs.push(line);
          if (currentParagraphs.length >= 60) {
            chapters.push({
              title: currentChapTitle,
              htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')
            });
            currentParagraphs = [];
          }
        }
      }
      if (currentParagraphs.length > 0) {
        chapters.push({
          title: currentChapTitle,
          htmlContent: currentParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')
        });
      }
      if (chapters.length === 0) {
        chapters.push({ title, htmlContent: '<p>（空文件）</p>' });
      }

      resolve({
        id: 'txt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: 'novel',
        title: title,
        cover: null,
        coverBlob: null,
        chapters: chapters,
        pageCount: chapters.length
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(txtFile, 'utf-8');
  });
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
      title: title || fallbackTitle + ' · 开始',
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

// ---- MOBI：PalmDOC 解压 + 正文净化，输出小说管道可用的章节 ----

export async function parseMobiFileLazy(file) {
  try {
    showToast(`正在解析 MOBI《${file.name}》...`);
    const fallbackTitle = file.name.replace(/\.(mobi|prc|azw)$/i, '');
    const data = parseMobiBuffer(await file.arrayBuffer(), fallbackTitle);
    const coverUrl = data.coverBlob ? URL.createObjectURL(data.coverBlob) : null;

    return {
      id: 'mobi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'novel',
      format: 'mobi',
      title: data.title,
      cover: coverUrl,
      coverBlob: data.coverBlob,
      chapters: data.chapters,
      pageCount: data.chapters.length
    };
  } catch (err) {
    console.error(err);
    showToast(mobiErrorText(err));
    return null;
  }
}

// 把散装图片按所在文件夹分组，每组生成一本书
export function buildImageFolderBooks(imgFiles) {
  if (!imgFiles || imgFiles.length === 0) return [];
  const folderGroups = {};
  imgFiles.forEach(f => {
    const rel = f.customRelativePath || f.webkitRelativePath || '';
    const parts = rel.split('/').filter(Boolean);
    let groupName = '本地漫画图集';
    if (parts.length >= 2) {
      groupName = parts[parts.length - 2];
    } else if (imgFiles.length === 1) {
      groupName = f.name.replace(/\.[^.]+$/, '');
    }
    if (!folderGroups[groupName]) folderGroups[groupName] = [];
    folderGroups[groupName].push(f);
  });

  return Object.entries(folderGroups).map(([folderName, groupImgs]) => {
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
        title: folderName,
        cover: firstCoverUrl,
        coverBlob: groupImgs[0],
        pageItems: pageItems,
        pageCount: pageItems.length
      }
    };
  });
}
