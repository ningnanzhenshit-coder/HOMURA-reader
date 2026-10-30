/* ============================================================================
   HOMURA · PDF 渲染
   ----------------------------------------------------------------------------
   PDF 版式固定，不能像 EPUB 那样重排；这里把每一页按需渲染成位图，
   交给现有漫画管道（pageItems）显示，书架 / 翻页 / 条漫 / 进度全部复用。
   pdf.js 体积较大，首次导入或恢复 PDF 时才动态加载；渲染出的页面位图
   走 LRU 缓存，避免来回翻页把内存吃满。
   ========================================================================== */

import PdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { showToast } from '../composables/useToast.js';

// 正文页按 1600px 宽渲染：桌面全屏显示足够清晰，缩放阅读也不糊
const RENDER_TARGET_WIDTH = 1600;
// 封面只用于书架卡片，小一点，避免存档里多塞一张大图
const COVER_TARGET_WIDTH = 900;
// 超小页面（如单格漫画）不无限放大，2.5 倍足够
const MAX_UPSCALE = 2.5;
// 缓存上限按页数算，约等于 20~50MB 位图，够翻几个来回了
const MAX_CACHED_PAGES = 24;

let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then(mod => {
      mod.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;
      return mod;
    }).catch(err => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

// ---- 渲染位图缓存：超出上限时释放最久未用过的页 ----

const renderedUrls = [];

function rememberRenderedUrl(pageItem, url) {
  renderedUrls.push({ pageItem, url });
  while (renderedUrls.length > MAX_CACHED_PAGES) {
    const evicted = renderedUrls.shift();
    URL.revokeObjectURL(evicted.url);
    // pageItem 上的 url 也要清掉，否则下次会拿到已失效的 blob URL
    if (evicted.pageItem.url === evicted.url) evicted.pageItem.url = '';
  }
}

async function renderPageBlob(pdfDoc, pageIndex, targetWidth) {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(targetWidth / baseViewport.width, MAX_UPSCALE);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  // 深色主题下 PDF 也保持纸面白底，与真实版面一致
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('页面位图生成失败');
  return blob;
}

// ---- 对外接口 ----

// 打开 PDF：只做文档装载，页数等信息由调用方读取
export async function openPdfDocument(file) {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  // CMap / 标准字体 / wasm 解码器由 vite-static-copy 放在 dist/pdfjs 下：
  // 缺了它们，CJK 非嵌入字体和 JPX/JBIG2 扫描页都会渲染成空白
  const assetBase = new URL('pdfjs/', document.baseURI).href;
  return pdfjs.getDocument({
    data,
    // 关掉 eval 渲染路径，降低恶意 PDF 注入脚本的风险
    isEvalSupported: false,
    cMapUrl: assetBase + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: assetBase + 'standard_fonts/',
    wasmUrl: assetBase + 'wasm/',
    iccUrl: assetBase + 'iccs/'
  }).promise;
}

// 生成漫画管道可用的 pageItems：每项自带 render()，首次显示时才真正渲染
export function createPdfPageItems(pdfDoc, pageCount) {
  const items = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const item = { pdfPageIndex: pageIndex };
    item.render = async () => {
      try {
        const blob = await renderPageBlob(pdfDoc, pageIndex, RENDER_TARGET_WIDTH);
        const url = URL.createObjectURL(blob);
        rememberRenderedUrl(item, url);
        return url;
      } catch (err) {
        console.error('[HOMURA] PDF 页面渲染失败', pageIndex, err);
        showToast(`PDF 第 ${pageIndex + 1} 页渲染失败`);
        return '';
      }
    };
    items.push(item);
  }
  return items;
}

// 封面取第一页的缩略渲染，返回值由调用方转成 Blob URL
export function renderPdfCoverBlob(pdfDoc) {
  return renderPageBlob(pdfDoc, 0, COVER_TARGET_WIDTH);
}
