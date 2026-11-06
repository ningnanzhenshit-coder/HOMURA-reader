import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  splitLongParagraph,
  collectNovelBlocks,
  buildActivePages,
  createNovelPaginator,
  ensureBookImagesResolved,
  releaseDistantPageUrls,
  releaseBookPageUrls,
  ensurePageUrlLoaded,
  decodeImgIntoElement
} from '../src/services/pagination.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.NodeFilter = dom.window.NodeFilter;

test('长段落中的 br 与行内标记可安全跨页拆分', () => {
  const prefix = '甲乙丙。🙂'.repeat(24);
  const suffix = '丁戊己。🙂'.repeat(24);
  const html = `<p><strong>${prefix}</strong><br><em>${suffix}</em></p>`;
  const maxHeight = 320;
  const measurer = document.createElement('div');

  Object.defineProperty(measurer, 'scrollHeight', {
    get() {
      const breakHeight = this.querySelectorAll('br').length * 40;
      return (this.textContent.length + breakHeight) * 10;
    }
  });

  const parts = splitLongParagraph(html, measurer, maxHeight);
  assert.ok(parts.length > 1, '超长段落应拆成多页');

  const roundTrip = document.createElement('div');
  let text = '';
  let breaks = 0;
  for (const part of parts) {
    roundTrip.innerHTML = part;
    text += roundTrip.textContent;
    breaks += roundTrip.querySelectorAll('br').length;
    assert.equal(roundTrip.firstElementChild.tagName, 'P');
    assert.ok(measurer.scrollHeight <= maxHeight, '每个分页片段都不应超过可用高度');
  }

  assert.equal(text, prefix + suffix);
  assert.equal(breaks, 1);
  assert.ok(parts.some(part => part.includes('<strong>')));
  assert.ok(parts.some(part => part.includes('<em>')));
});

test('段落末尾的 margin 不计入分页高度', () => {
  const measurer = document.createElement('div');
  Object.defineProperty(measurer, 'scrollHeight', {
    get() {
      // 模拟真实布局：scrollHeight 把最后一段的 margin-bottom 一并算进去。
      return this.textContent.length * 10 + 25;
    }
  });

  const originalGetRect = dom.window.Element.prototype.getBoundingClientRect;
  const originalGetStyle = window.getComputedStyle;
  dom.window.Element.prototype.getBoundingClientRect = function() {
    if (this === measurer) return { top: 0, bottom: 0, height: 0 };
    if (this.tagName === 'P' && measurer.contains(this)) {
      const height = this.textContent.length * 10;
      return { top: 0, bottom: height, height };
    }
    return { top: 0, bottom: 0, height: 0 };
  };
  window.getComputedStyle = element => (
    element.tagName === 'P' ? { lineHeight: '10px' } : originalGetStyle(element)
  );

  const text = '字'.repeat(100);
  try {
    // scrollHeight 是 1025，但正文实际只有 1000，不应该被拆成两页。
    assert.deepEqual(splitLongParagraph(`<p>${text}</p>`, measurer, 1000), [`<p>${text}</p>`]);
  } finally {
    dom.window.Element.prototype.getBoundingClientRect = originalGetRect;
    window.getComputedStyle = originalGetStyle;
  }
});

test('含不可拆分媒体时保留原始段落', () => {
  const html = '<p>正文<img src="cover.jpg" alt=""></p>';
  const measurer = document.createElement('div');
  Object.defineProperty(measurer, 'scrollHeight', { value: 1000 });
  assert.deepEqual(splitLongParagraph(html, measurer, 100), [html]);
});

test('含插图的 EPUB 章节容器会拆成独立 blocks', () => {
  const html = `
    <section>
      <h1>插图</h1>
      <figure><svg><image href="one.jpg"></image></svg></figure>
      <figure><svg><image href="two.jpg"></image></svg></figure>
      <p>正文段落</p>
    </section>
  `;
  const blocks = collectNovelBlocks(html);

  assert.deepEqual(blocks.map(block => block.type), ['h1', 'figure', 'figure', 'p']);
  assert.match(blocks[1].html, /one\.jpg/);
  assert.match(blocks[2].html, /two\.jpg/);
});

test('容器内混有直接文本时保留原容器，避免丢字', () => {
  const html = '<div>前置文字<figure><img src="one.jpg" alt=""></figure>后置文字</div>';
  const blocks = collectNovelBlocks(html);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'div');
  assert.match(blocks[0].html, /前置文字/);
  assert.match(blocks[0].html, /后置文字/);
});

test('并发章节复用同一张 EPUB 插图，不重复解包', async () => {
  let blobRequests = 0;
  const entry = {
    async async() {
      blobRequests++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return new Blob(['image'], { type: 'image/jpeg' });
    }
  };
  const book = {
    zipContent: { file: path => path === 'images/shared.jpg' ? entry : null },
    chapters: Array.from({ length: 6 }, () => ({
      htmlContent: '<figure><img data-zip-path="images/shared.jpg" alt=""></figure>'
    }))
  };
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = () => 'blob:shared-image';

  try {
    await ensureBookImagesResolved(book, 6);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
  }

  assert.equal(blobRequests, 1);
  assert.equal(book.epubImageUrls.size, 1);
  assert.deepEqual(book.resourceUrls, ['blob:shared-image']);
  assert.ok(book.chapters.every(chapter => chapter.imagesResolved));
  assert.ok(book.chapters.every(chapter => chapter.htmlContent.includes('src="blob:shared-image"')));
});

test('解码后的 EPUB 插图写入天然宽高，保证分页测量稳定', async () => {
  const book = {
    zipContent: {
      file: () => ({
        async async() {
          return new Blob(['image'], { type: 'image/jpeg' });
        }
      })
    },
    chapters: [{
      htmlContent: '<figure><img data-zip-path="images/illustration.jpg" alt=""></figure>'
    }]
  };
  const originalCreateObjectURL = URL.createObjectURL;
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  URL.createObjectURL = () => 'blob:sized-image';
  globalThis.Image = class {
    constructor() {
      this.naturalWidth = 800;
      this.naturalHeight = 1200;
    }
    async decode() {}
  };

  try {
    await ensureBookImagesResolved(book);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage);
    else delete globalThis.Image;
  }

  assert.match(book.chapters[0].htmlContent, /width="800"/);
  assert.match(book.chapters[0].htmlContent, /height="1200"/);
});

test('增量测量分页保持段落顺序且不丢正文', () => {
  const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const originalHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 710 });

  const measurer = document.createElement('div');
  Object.defineProperty(measurer, 'scrollHeight', {
    get() {
      return this.childNodes.length * 160;
    }
  });
  const book = {
    type: 'novel',
    chapters: [{
      title: '第一章',
      htmlContent: '<p>甲</p><p>乙</p><p>丙</p><p>丁</p><p>戊</p>'
    }]
  };

  try {
    const pages = buildActivePages(book, { direction: 'ltr', spread: 1, fontSize: 18 }, measurer);
    const texts = pages.map(page => {
      const node = document.createElement('div');
      node.innerHTML = page.html;
      return node.textContent;
    });

    assert.deepEqual(texts, ['甲乙', '丙丁', '戊']);
    assert.deepEqual(pages.map(page => page.pageNumber), [1, 2, 3]);
  } finally {
    if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    if (originalHeight) Object.defineProperty(document.documentElement, 'clientHeight', originalHeight);
  }
});

test('增量分页先测当前章，其余章用整章占位，补齐后与同步结果一致', () => {
  const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const originalHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 710 });

  const measurer = document.createElement('div');
  Object.defineProperty(measurer, 'scrollHeight', {
    get() {
      return this.childNodes.length * 160;
    }
  });
  const book = {
    type: 'novel',
    chapters: [
      { title: '第一章', htmlContent: '<p>甲</p><p>乙</p><p>丙</p>' },
      { title: '第二章', htmlContent: '<p>丁</p><p>戊</p>' },
      { title: '第三章', htmlContent: '<p>己</p><p>庚</p><p>辛</p>' }
    ]
  };

  try {
    const paginator = createNovelPaginator(book, { direction: 'ltr', spread: 1, fontSize: 18 }, measurer);
    paginator.paginateChapter(1);
    const partial = paginator.buildPages({ provisional: true });

    assert.deepEqual(partial.map(page => page.chapterIndex), [0, 1, 2]);
    assert.equal(partial[0].provisional, true);
    assert.equal(partial[1].provisional, undefined);
    assert.equal(partial[2].provisional, true);
    assert.deepEqual(partial.map(page => page.pageNumber), [1, 2, 3]);

    paginator.paginateChapter(0);
    paginator.paginateChapter(2);
    assert.equal(paginator.isComplete(), true);
    const complete = paginator.commitCache();
    const texts = complete.map(page => {
      const node = document.createElement('div');
      node.innerHTML = page.html;
      return node.textContent;
    });

    assert.deepEqual(texts, ['甲乙', '丙', '丁戊', '己庚', '辛']);
    assert.deepEqual(complete.map(page => page.pageNumber), [1, 2, 3, 4, 5]);
    assert.ok(complete.every(page => page.provisional === undefined));
    assert.equal(measurer.innerHTML, '');
  } finally {
    if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    if (originalHeight) Object.defineProperty(document.documentElement, 'clientHeight', originalHeight);
  }
});

test('页图 URL 只保留阅读窗口，书封共用的首页不回收', () => {
  const pages = Array.from({ length: 10 }, (_, index) => ({
    zipEntry: { name: `page-${index}.jpg` },
    url: index === 0 ? 'blob:cover' : `blob:page-${index}`
  }));
  const book = { type: 'manga', cover: 'blob:cover', pageItems: pages };

  releaseDistantPageUrls(book, 5, 2);

  assert.equal(pages[0].url, 'blob:cover');
  assert.equal(pages[1].url, '');
  assert.equal(pages[2].url, '');
  assert.equal(pages[3].url, 'blob:page-3');
  assert.equal(pages[7].url, 'blob:page-7');
  assert.equal(pages[8].url, '');
  assert.equal(pages[9].url, '');

  releaseBookPageUrls(book);
  assert.equal(pages[0].url, 'blob:cover');
  assert.equal(pages[3].url, '');
  assert.equal(pages[7].url, '');
});

test('没有后备来源的纯 URL 页不会被回收', () => {
  const pages = [
    { url: 'data:image/svg+xml;utf8,page-1' },
    { url: 'data:image/svg+xml;utf8,page-2' }
  ];
  const book = { type: 'manga', cover: null, pageItems: pages };

  releaseDistantPageUrls(book, 0, 0);
  releaseBookPageUrls(book);

  assert.equal(pages[0].url, 'data:image/svg+xml;utf8,page-1');
  assert.equal(pages[1].url, 'data:image/svg+xml;utf8,page-2');
});

test('原生页优先返回 asset URL，不走字节拷贝', async () => {
  const calls = [];
  window.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        calls.push([command, args]);
        return { path: '/data/cache/00001.webp', mime: 'image/webp', width: 1200, height: 1800 };
      },
      convertFileSrc: filePath => `http://asset.localhost/${encodeURIComponent(filePath)}`
    }
  };
  const page = { nativeArchiveId: 'book-1', nativeIndex: 1 };

  try {
    const url = await ensurePageUrlLoaded(page);
    assert.equal(url, 'http://asset.localhost/%2Fdata%2Fcache%2F00001.webp');
    assert.equal(page.urlIsAsset, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'extract');
  } finally {
    delete window.__TAURI__;
  }
});

test('asset 图片解码失败时清掉 URL，交给 Blob 通道重试', async () => {
  const img = document.createElement('img');
  img.decode = () => Promise.reject(new Error('decode failed'));
  Object.defineProperty(img, 'naturalWidth', { value: 0 });
  const page = {
    nativeArchiveId: 'book-1',
    nativeIndex: 1,
    url: 'http://asset.localhost/page',
    urlIsAsset: true
  };

  const ok = await decodeImgIntoElement(img, page.url, page);

  assert.equal(ok, false);
  assert.equal(page.url, '');
  assert.equal(page.urlIsAsset, false);
});

test('条漫临时读取失败时保留已解码的图片，不清掉页面高度', async () => {
  const img = document.createElement('img');
  img.setAttribute('src', 'blob:already-loaded');

  const ok = await decodeImgIntoElement(img, '', null, { preserveSrcOnEmpty: true });

  assert.equal(ok, false);
  assert.equal(img.getAttribute('src'), 'blob:already-loaded');
});

test('复用槽位遇到空 URL 时仍清掉上一页的图片', async () => {
  const img = document.createElement('img');
  img.setAttribute('src', 'blob:previous-page');

  const ok = await decodeImgIntoElement(img, '', null);

  assert.equal(ok, false);
  assert.equal(img.hasAttribute('src'), false);
});

test('单页 asset 解码失败不会让整本书立刻退回 Blob', async () => {
  window.__TAURI__ = {
    core: {
      invoke: async () => ({ path: '/data/cache/00002.webp', mime: 'image/webp' }),
      convertFileSrc: filePath => `http://asset.localhost/${encodeURIComponent(filePath)}`
    }
  };
  const page = { nativeArchiveId: 'book-1', nativeIndex: 2 };

  try {
    const url = await ensurePageUrlLoaded(page);
    assert.equal(url, 'http://asset.localhost/%2Fdata%2Fcache%2F00002.webp');
    assert.equal(page.urlIsAsset, true);
  } finally {
    delete window.__TAURI__;
  }
});

test('回收原生页 URL 后允许下次重新尝试 asset', () => {
  const pages = [{
    nativeArchiveId: 'book-1',
    nativeIndex: 3,
    url: 'blob:page-3',
    urlIsAsset: false,
    nativeAssetUnavailable: true
  }];
  const book = { type: 'manga', cover: null, pageItems: pages };

  releaseDistantPageUrls(book, 8, 1);

  assert.equal(pages[0].url, '');
  assert.equal(pages[0].nativeAssetUnavailable, false);
});

test('同一压缩包页并发取 URL 只创建一次 Blob URL', async () => {
  const created = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => {
    const url = `blob:race-${created.length + 1}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = () => {};

  const blob = { size: 32, type: 'image/jpeg' };
  const page = { zipEntry: { async: () => Promise.resolve(blob) }, url: null };

  try {
    // 预载与翻页可能在同一个 tick 里同时命中同一页
    const [first, second] = await Promise.all([
      ensurePageUrlLoaded(page),
      ensurePageUrlLoaded(page)
    ]);

    assert.equal(created.length, 1, '并发取同一页只应创建一次 Blob URL');
    assert.equal(first, second);
    assert.equal(page.url, first);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
