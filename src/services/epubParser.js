/* ============================================================================
   HOMURA · EPUB 解析核心
   ----------------------------------------------------------------------------
   JSZip 与 Android 原生 ZipFile 只负责提供文本和 Blob，这里统一处理
   container、OPF、spine、漫画判定及正文清洗，保证两条存储后端行为一致。
   ========================================================================== */

import JSZip from 'jszip';
import { sanitizeEpubHtml } from './sanitize.js';
import { shouldReadEpubAsManga, TEXT_CHAPTER_MIN_LENGTH } from './epubType.js';
import {
  clearNativeArchiveBookCache,
  closeNativeArchive,
  openNativeDocument,
  readNativePageBlob,
  readNativeTextBatch
} from './nativeArchive.js';

const NATIVE_TEXT_BATCH_SIZE = 128;

function resolveRelativePath(basePath, relativePath) {
  const baseDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/') + 1) : '';
  const stack = baseDir.split('/').filter(Boolean);
  const parts = relativePath.split('/');
  for (const part of parts) {
    if (part === '..') stack.pop();
    else if (part !== '.' && part !== '') stack.push(part);
  }
  return stack.join('/');
}

export function makeEpubId() {
  return 'epub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

export function epubTitleFromFileName(name) {
  return String(name || 'book.epub').replace(/(\.kepub)?\.epub$/i, '');
}

async function readNativeTexts(archiveId, paths, entryIndexByPath) {
  const textByPath = new Map();
  const validPaths = paths.filter(path => entryIndexByPath.has(path));

  const readBatch = async batch => {
    if (batch.length === 0) return;
    const entries = await readNativeTextBatch(archiveId, batch);
    for (const entry of entries) {
      if (entry?.path) textByPath.set(entry.path, entry.text);
    }
    const missing = batch.filter(path => !textByPath.has(path));
    // Kotlin 单次最多返回 32MB 文本；被总量截断时递归拆批补读，
    // 单个条目仍读不到才视为缺失，避免长篇小说后半段静默消失。
    if (missing.length === 0 || batch.length === 1) return;
    const middle = Math.ceil(missing.length / 2);
    await readBatch(missing.slice(0, middle));
    await readBatch(missing.slice(middle));
  };

  for (let start = 0; start < validPaths.length; start += NATIVE_TEXT_BATCH_SIZE) {
    await readBatch(validPaths.slice(start, start + NATIVE_TEXT_BATCH_SIZE));
  }
  return paths.map(path => textByPath.has(path) ? textByPath.get(path) : null);
}

export async function createJsZipEpubArchive(file) {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(file);

  return {
    kind: 'jszip',
    zipContent,
    hasPath(path) {
      return !!zipContent.file(path);
    },
    resolvePath(candidates) {
      return candidates.find(path => !!zipContent.file(path)) || null;
    },
    async readTexts(paths) {
      const texts = [];
      for (const path of paths) {
        const entry = zipContent.file(path);
        if (!entry) {
          texts.push(null);
          continue;
        }
        try {
          texts.push(await entry.async('text'));
        } catch (err) {
          texts.push(null);
        }
      }
      return texts;
    },
    async readBlobByPath(path) {
      const entry = zipContent.file(path);
      return entry ? entry.async('blob') : null;
    },
    makePageItem(path, url) {
      return {
        zipEntry: zipContent.file(path),
        url
      };
    },
    bookFields() {
      return { zipContent };
    }
  };
}

export async function createNativeEpubArchive(nativePath, options = {}) {
  const archiveId = options.id;
  if (!archiveId) throw new Error('原生 EPUB 缺少书籍 ID');

  const opened = await openNativeDocument(archiveId, nativePath);
  const entries = Array.isArray(opened?.entries) ? opened.entries : [];
  if (entries.length === 0) throw new Error('原生 EPUB 没有可读取的条目');

  const entryIndexByPath = new Map();
  const entryByPath = new Map();
  for (const entry of entries) {
    const path = entry?.path || entry?.name;
    if (!path) continue;
    entryByPath.set(path, entry);
    if (Number.isInteger(entry.index)) entryIndexByPath.set(path, entry.index);
  }

  const hasPath = path => entryIndexByPath.has(path);

  return {
    kind: 'native',
    archiveId,
    nativeArchivePath: nativePath,
    entryIndexByPath,
    hasPath,
    resolvePath(candidates) {
      return candidates.find(hasPath) || null;
    },
    async readTexts(paths) {
      return readNativeTexts(archiveId, paths, entryIndexByPath);
    },
    async readBlobByPath(path) {
      const index = entryIndexByPath.get(path);
      if (!Number.isInteger(index)) return null;
      const page = await readNativePageBlob(archiveId, index);
      return page.blob;
    },
    makePageItem(path, url) {
      const index = entryIndexByPath.get(path);
      const entry = entryByPath.get(path);
      if (!Number.isInteger(index)) throw new Error('原生 EPUB 图片索引缺失');
      const item = {
        nativeArchiveId: archiveId,
        nativeArchivePath: nativePath,
        nativeArchiveMode: 'document',
        nativeIndex: index,
        url
      };
      if (entry?.width > 0 && entry?.height > 0) {
        item.imageWidth = entry.width;
        item.imageHeight = entry.height;
      }
      return item;
    },
    bookFields() {
      return {
        nativeArchiveId: archiveId,
        nativeArchivePath: nativePath,
        nativeArchiveMode: 'document',
        nativeEntryIndexByPath: entryIndexByPath
      };
    }
  };
}

async function readEpubCover(archive, path) {
  if (!path) return { cover: null, coverBlob: null };
  const coverBlob = await archive.readBlobByPath(path);
  if (!coverBlob) throw new Error('无法读取 EPUB 封面图');
  return {
    cover: URL.createObjectURL(coverBlob),
    coverBlob
  };
}

export async function parseEpubArchive(archive, options = {}) {
  const id = options.id;
  if (!id) throw new Error('EPUB 解析缺少书籍 ID');
  const fallbackTitle = options.fallbackTitle || '未命名 EPUB';
  const parser = new DOMParser();

  const [containerXml] = await archive.readTexts(['META-INF/container.xml']);
  if (!containerXml) throw new Error('缺少 META-INF/container.xml');

  const containerDoc = parser.parseFromString(containerXml, 'text/xml');
  const rootfileEl = containerDoc.querySelector('rootfile');
  const declaredOpfPath = rootfileEl?.getAttribute('full-path') || 'content.opf';
  const opfCandidates = [declaredOpfPath];
  try {
    const decodedOpfPath = decodeURIComponent(declaredOpfPath);
    if (decodedOpfPath !== declaredOpfPath) opfCandidates.push(decodedOpfPath);
  } catch (err) {}
  const opfPath = archive.resolvePath(opfCandidates);
  if (!opfPath) throw new Error('未找到 OPF 配置文件');

  const [opfText] = await archive.readTexts([opfPath]);
  if (!opfText) throw new Error('无法读取 OPF 配置文件');
  const opfDoc = parser.parseFromString(opfText, 'text/xml');
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  const titleEl = opfDoc.getElementsByTagNameNS(
    'http://purl.org/dc/elements/1.1/',
    'title'
  )[0]
    || opfDoc.getElementsByTagName('dc:title')[0]
    || opfDoc.querySelector('title');
  const parsedTitle = titleEl?.textContent?.trim();
  const bookTitle = parsedTitle || fallbackTitle;

  const manifest = {};
  opfDoc.querySelectorAll('manifest > item').forEach(item => {
    manifest[item.getAttribute('id')] = {
      href: item.getAttribute('href'),
      mediaType: item.getAttribute('media-type') || ''
    };
  });

  const spine = [];
  opfDoc.querySelectorAll('spine > itemref').forEach(ref => {
    const item = manifest[ref.getAttribute('idref')];
    if (!item?.href) return;
    const fullPath = opfDir + decodeURIComponent(item.href);
    const path = archive.resolvePath([fullPath, item.href]);
    if (path) spine.push({ href: item.href, path });
  });

  const rawHtmls = await archive.readTexts(spine.map(item => item.path));
  const lazyMangaPaths = [];
  const seenGlobalPaths = new Set();
  const chapters = [];
  let imageHeavyCount = 0;
  let textChapterCount = 0;

  for (let index = 0; index < spine.length; index++) {
    const item = spine[index];
    const rawHtml = rawHtmls[index];
    if (!rawHtml) continue;

    const htmlDoc = parser.parseFromString(rawHtml, 'text/html');
    const imgs = htmlDoc.querySelectorAll('img, image');
    const foundPathsInPage = [];
    const seenInCurrentPage = new Set();

    for (const img of imgs) {
      const srcAttr = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href');
      if (!srcAttr || srcAttr.startsWith('http') || srcAttr.startsWith('data:')) continue;

      const cleanSrc = decodeURIComponent(srcAttr.split('#')[0]);
      const resolved = resolveRelativePath(item.path, cleanSrc);
      const imagePath = archive.resolvePath([resolved, cleanSrc]);
      if (!imagePath) continue;

      img.setAttribute('data-zip-path', imagePath);
      if (!seenInCurrentPage.has(imagePath)) {
        seenInCurrentPage.add(imagePath);
        foundPathsInPage.push(imagePath);
      }
    }

    const plainText = (htmlDoc.body?.textContent || '').trim();
    if (plainText.length >= TEXT_CHAPTER_MIN_LENGTH) textChapterCount++;
    if (foundPathsInPage.length > 0 && plainText.length < 60) {
      imageHeavyCount++;
      foundPathsInPage.forEach(path => {
        if (seenGlobalPaths.has(path)) return;
        seenGlobalPaths.add(path);
        lazyMangaPaths.push(path);
      });
    }

    const chapterHeading = htmlDoc.body?.querySelector('h1, h2, h3')?.textContent?.trim()
      || htmlDoc.querySelector('title')?.textContent?.trim()
      || item.href.split('/').pop().replace(/\.[^.]+$/, '');
    const bodyHtml = sanitizeEpubHtml(htmlDoc.body ? htmlDoc.body.innerHTML : rawHtml);
    if (bodyHtml.length > 0) {
      chapters.push({
        title: chapterHeading,
        htmlContent: bodyHtml
      });
    }
  }

  const isMangaEpub = shouldReadEpubAsManga({
    chapterCount: chapters.length,
    textChapterCount,
    imageHeavyChapterCount: imageHeavyCount,
    imageCount: lazyMangaPaths.length
  });

  if (isMangaEpub && lazyMangaPaths.length > 0) {
    const { cover, coverBlob } = await readEpubCover(archive, lazyMangaPaths[0]);
    const pageItems = lazyMangaPaths.map((path, index) => (
      archive.makePageItem(path, index === 0 ? cover : null)
    ));

    return {
      id,
      type: 'manga',
      format: 'epub',
      title: bookTitle,
      cover,
      coverBlob,
      pageItems,
      pageCount: pageItems.length,
      ...archive.bookFields()
    };
  }

  if (chapters.length === 0) throw new Error('未能提取出有效章节内容');

  const { cover, coverBlob } = await readEpubCover(archive, lazyMangaPaths[0]);
  return {
    id,
    type: 'epub',
    format: 'epub',
    title: bookTitle,
    cover,
    coverBlob,
    chapters,
    pageCount: chapters.length,
    ...archive.bookFields()
  };
}

export async function parseEpubNativeArchive(nativePath, options = {}) {
  const id = options.id || makeEpubId();
  const fallbackTitle = epubTitleFromFileName(options.name || 'book.epub');
  try {
    const archive = await createNativeEpubArchive(nativePath, { id });
    return await parseEpubArchive(archive, { id, fallbackTitle });
  } catch (err) {
    await closeNativeArchive(id).catch(() => {});
    await clearNativeArchiveBookCache(id).catch(() => {});
    throw err;
  }
}

// 安卓优先从 AppData 里的原文件随机读取；原生失败时再回落到 JSZip。
export async function parseEpubFile(file, options = {}) {
  const id = options.id || makeEpubId();
  const fallbackTitle = epubTitleFromFileName(options.name || file?.name);

  if (options.nativePath) {
    try {
      return await parseEpubNativeArchive(options.nativePath, {
        id,
        name: options.name || file?.name
      });
    } catch (err) {
      console.warn('[HOMURA] Android 原生 EPUB 解析失败，回退 JSZip', err);
    }
  }

  const archive = await createJsZipEpubArchive(file);
  return parseEpubArchive(archive, { id, fallbackTitle });
}
