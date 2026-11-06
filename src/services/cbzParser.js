/* ============================================================================
   HOMURA · 漫画压缩包解析
   ----------------------------------------------------------------------------
   CBZ / ZIP 优先使用原生会话按需解页；原生不可用或普通失败时再回退 JSZip。
   安全限制与资源超限错误不会触发回退。
   ========================================================================== */

import JSZip from 'jszip';
import {
  canUseNativeArchive,
  clearNativeArchiveBookCache,
  closeNativeArchive,
  openNativeArchive,
  readNativePageBlob,
  shouldFallbackNativeArchive
} from './nativeArchive.js';

// 原生快速路径：压缩包只打开一次，页面按需解出到 AppCache。
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
      imageWidth: entry.width || 0,
      imageHeight: entry.height || 0,
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
      if (!shouldFallbackNativeArchive(err)) throw err;
      console.warn('[HOMURA] 原生压缩包解析失败，回退 JSZip', err);
    }
  }
  const fallbackFile = typeof options.loadFallbackFile === 'function'
    ? await options.loadFallbackFile()
    : file;
  if (!fallbackFile) return null;

  try {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(fallbackFile);
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

    return {
      id,
      type: 'manga',
      format: 'cbz',
      title: name.replace(/\.(cbz|zip)$/i, ''),
      cover: firstUrl,
      coverBlob: firstBlob,
      pageItems,
      pageCount: pageItems.length,
      nativeArchiveStaged: !!options.staged
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}
