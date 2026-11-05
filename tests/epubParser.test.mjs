import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import {
  createNativeEpubArchive,
  createJsZipEpubArchive,
  parseEpubArchive,
  parseEpubFile,
  parseEpubNativeArchive
} from '../src/services/epubParser.js';
import { closeNativeArchive } from '../src/services/nativeArchive.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
globalThis.NodeFilter = dom.window.NodeFilter;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function escapeXml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }[char]));
}

function buildOpf({ title, items }) {
  const manifest = items.map(item => (
    `<item id="${escapeXml(item.id)}" href="${escapeXml(item.href)}" media-type="${escapeXml(item.mediaType)}"/>`
  )).join('');
  const spine = items
    .filter(item => item.spine)
    .map(item => `<itemref idref="${escapeXml(item.id)}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">homura-test</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
  </metadata>
  <manifest>${manifest}</manifest>
  <spine>${spine}</spine>
</package>`;
}

async function buildEpub({
  title = '测试书',
  opfPath = 'OEBPS/content.opf',
  containerOpfPath = opfPath,
  items = [],
  includeContainer = true
} = {}) {
  const zip = new JSZip();
  const entries = new Map();
  const addEntry = (path, content) => {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    entries.set(path, bytes);
    zip.file(path, bytes);
  };

  addEntry('mimetype', 'application/epub+zip');
  if (includeContainer) {
    addEntry('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${escapeXml(containerOpfPath)}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  }
  addEntry(opfPath, buildOpf({ title, items }));
  for (const item of items) {
    addEntry(item.path, item.content);
  }

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return { bytes, entries };
}

function imageItem(id, href, path, spine = false) {
  return {
    id,
    href,
    path,
    spine,
    mediaType: 'image/jpeg',
    content: new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  };
}

function xhtmlItem(id, href, path, body, spine = true) {
  return {
    id,
    href,
    path,
    spine,
    mediaType: 'application/xhtml+xml',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(id)}</title></head><body>${body}</body></html>`
  };
}

function releaseBookUrls(book) {
  const urls = new Set([book?.cover, ...(book?.pageItems || []).map(item => item.url)]);
  for (const url of urls) {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}

function epubFile(epub, name = 'fixture.epub') {
  return new File([epub.bytes], name, { type: 'application/epub+zip' });
}

test('图片型 EPUB 按 spine 顺序生成漫画页', async () => {
  const epub = await buildEpub({
    title: '漫画样本',
    items: [
      xhtmlItem('p1', 'Text/001.xhtml', 'OEBPS/Text/001.xhtml', '<img src="../Images/001.jpg" alt=""/>'),
      xhtmlItem('p2', 'Text/002.xhtml', 'OEBPS/Text/002.xhtml', '<img src="../Images/002.jpg" alt=""/>'),
      xhtmlItem('p3', 'Text/003.xhtml', 'OEBPS/Text/003.xhtml', '<img src="../Images/003.jpg" alt=""/>'),
      imageItem('i1', 'Images/001.jpg', 'OEBPS/Images/001.jpg'),
      imageItem('i2', 'Images/002.jpg', 'OEBPS/Images/002.jpg'),
      imageItem('i3', 'Images/003.jpg', 'OEBPS/Images/003.jpg')
    ]
  });
  const book = await parseEpubArchive(
    await createJsZipEpubArchive(epub.bytes),
    { id: 'epub-manga', fallbackTitle: '文件名' }
  );

  try {
    assert.equal(book.type, 'manga');
    assert.equal(book.format, 'epub');
    assert.equal(book.title, '漫画样本');
    assert.equal(book.pageCount, 3);
    assert.deepEqual(
      book.pageItems.map(item => item.zipEntry.name),
      [
        'OEBPS/Images/001.jpg',
        'OEBPS/Images/002.jpg',
        'OEBPS/Images/003.jpg'
      ]
    );
    assert.equal(book.pageItems[0].url, book.cover);
    assert.equal(book.pageItems[1].url, null);
    assert.equal(book.coverBlob.size, 4);
    assert.ok(book.zipContent);
  } finally {
    releaseBookUrls(book);
  }
});

test('小说保留章节、清洗危险 HTML，并解析 ../ 插图路径', async () => {
  const longText = '这是一段足够长的正文。'.repeat(12);
  const epub = await buildEpub({
    title: '测试小说',
    items: [
      xhtmlItem(
        'c1',
        'Text/chapter1.xhtml',
        'OEBPS/Text/chapter1.xhtml',
        `<h1>第一章</h1><p>${longText}</p>
<img src="../Images/illustration.jpg" onclick="alert(1)" alt="插图"/>
<script>alert('bad')</script><a href="javascript:alert(2)">危险链接</a>`
      ),
      xhtmlItem(
        'c2',
        'Text/chapter2.xhtml',
        'OEBPS/Text/chapter2.xhtml',
        `<h2>第二章</h2><p>${longText}</p>`
      ),
      imageItem('cover', 'Images/illustration.jpg', 'OEBPS/Images/illustration.jpg')
    ]
  });
  const book = await parseEpubArchive(
    await createJsZipEpubArchive(epub.bytes),
    { id: 'epub-novel', fallbackTitle: '文件名' }
  );

  try {
    assert.equal(book.type, 'epub');
    assert.equal(book.title, '测试小说');
    assert.equal(book.pageCount, 2);
    assert.deepEqual(book.chapters.map(chapter => chapter.title), ['第一章', '第二章']);
    assert.match(book.chapters[0].htmlContent, /data-zip-path="OEBPS\/Images\/illustration\.jpg"/);
    assert.doesNotMatch(book.chapters[0].htmlContent, /<script|onclick|javascript:/i);
    assert.ok(book.zipContent);
  } finally {
    releaseBookUrls(book);
  }
});

test('URL 编码的 OPF 与章节路径可正常解析', async () => {
  const epub = await buildEpub({
    title: '编码路径',
    opfPath: 'OEBPS/content book.opf',
    containerOpfPath: 'OEBPS/content%20book.opf',
    items: [
      xhtmlItem(
        'c1',
        'Text/ch%201.xhtml',
        'OEBPS/Text/ch 1.xhtml',
        '<h1>编码章节</h1><p>正文</p>'
      )
    ]
  });
  const book = await parseEpubArchive(
    await createJsZipEpubArchive(epub.bytes),
    { id: 'epub-encoded', fallbackTitle: '文件名' }
  );

  assert.equal(book.title, '编码路径');
  assert.equal(book.pageCount, 1);
  assert.equal(book.chapters[0].title, '编码章节');
});

test('缺少 container.xml 或 OPF 时明确失败', async () => {
  const noContainer = await buildEpub({
    includeContainer: false,
    items: [xhtmlItem('c1', 'Text/chapter.xhtml', 'OEBPS/Text/chapter.xhtml', '<p>正文</p>')]
  });
  await assert.rejects(
    parseEpubArchive(
      await createJsZipEpubArchive(noContainer.bytes),
      { id: 'epub-no-container' }
    ),
    /缺少 META-INF\/container\.xml/
  );

  const noOpf = await buildEpub({
    containerOpfPath: 'OEBPS/missing.opf',
    items: [xhtmlItem('c1', 'Text/chapter.xhtml', 'OEBPS/Text/chapter.xhtml', '<p>正文</p>')]
  });
  await assert.rejects(
    parseEpubArchive(
      await createJsZipEpubArchive(noOpf.bytes),
      { id: 'epub-no-opf' }
    ),
    /未找到 OPF 配置文件/
  );
});

test('原生文档条目映射为可恢复的漫画页索引', async () => {
  const archiveId = 'epub-native-pages';
  dom.window.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        const name = command.split('|').pop();
        if (name === 'openDocument') {
          return {
            archiveId: args.archiveId,
            entries: [
              { index: 0, path: 'OEBPS/Text/001.xhtml', name: 'OEBPS/Text/001.xhtml', size: 20 },
              { index: 1, path: 'OEBPS/Images/001.jpg', name: 'OEBPS/Images/001.jpg', size: 4 }
            ]
          };
        }
        if (name === 'close') return null;
        throw new Error(`未模拟原生命令：${name}`);
      }
    }
  };

  const nativePath = 'homura-native-sources/epub-native-pages/source/book.epub';
  const archive = await createNativeEpubArchive(nativePath, { id: archiveId });
  try {
    assert.deepEqual(archive.makePageItem('OEBPS/Images/001.jpg', null), {
      nativeArchiveId: archiveId,
      nativeArchivePath: nativePath,
      nativeArchiveMode: 'document',
      nativeIndex: 1,
      url: null
    });
    assert.equal(archive.bookFields().nativeEntryIndexByPath.get('OEBPS/Images/001.jpg'), 1);
  } finally {
    await closeNativeArchive(archiveId);
  }
});

test('Android 原生 EPUB 可用时优先使用原生解析', async () => {
  const epub = await buildEpub({
    title: '原生优先',
    items: [
      xhtmlItem('c1', 'Text/chapter.xhtml', 'OEBPS/Text/chapter.xhtml', '<h1>原生章节</h1><p>正文</p>')
    ]
  });
  const entries = Array.from(epub.entries.entries());
  dom.window.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        const name = command.split('|').pop();
        if (name === 'openDocument') {
          return {
            archiveId: args.archiveId,
            entries: entries.map(([path, bytes], index) => ({
              index,
              path,
              name: path,
              size: bytes.length
            }))
          };
        }
        if (name === 'readTextBatch') {
          const requested = JSON.parse(args.pathsJson);
          return {
            texts: requested.flatMap(path => {
              const bytes = epub.entries.get(path);
              return bytes ? [{ path, text: decoder.decode(bytes), size: bytes.length }] : [];
            })
          };
        }
        if (name === 'close') return null;
        throw new Error(`未模拟原生命令：${name}`);
      }
    }
  };

  const id = 'epub-native-preferred';
  const book = await parseEpubFile(epubFile(epub), {
    id,
    name: '原生优先.epub',
    nativePath: 'homura-native-sources/epub-native-preferred/source/book.epub'
  });
  try {
    assert.equal(book.nativeArchiveId, id);
    assert.equal(book.nativeArchiveMode, 'document');
    assert.equal(book.chapters[0].title, '原生章节');
    assert.equal(book.zipContent, undefined);
  } finally {
    releaseBookUrls(book);
    await closeNativeArchive(id);
  }
});

test('原生 EPUB 打开失败时回退 JSZip 且不留下会话', async () => {
  const epub = await buildEpub({
    title: '回退小说',
    items: [
      xhtmlItem('c1', 'Text/chapter.xhtml', 'OEBPS/Text/chapter.xhtml', '<h1>回退章节</h1><p>正文</p>')
    ]
  });
  let openAttempts = 0;
  const lifecycleCalls = [];
  dom.window.__TAURI__ = {
    core: {
      invoke: async command => {
        const name = command.split('|').pop();
        if (name === 'openDocument') {
          openAttempts++;
          throw new Error('ZipFile 打开失败');
        }
        if (name === 'close' || name === 'clearBook') {
          lifecycleCalls.push(name);
          return null;
        }
        throw new Error(`未模拟原生命令：${name}`);
      }
    }
  };

  const book = await parseEpubFile(epubFile(epub), {
    id: 'epub-native-fallback',
    nativePath: 'homura-native-sources/epub-native-fallback/source/book.epub'
  });
  try {
    assert.equal(openAttempts, 1);
    assert.equal(book.title, '回退小说');
    assert.equal(book.chapters[0].title, '回退章节');
    assert.ok(book.zipContent);
    assert.equal(book.nativeArchiveId, undefined);
    assert.deepEqual(lifecycleCalls, ['close', 'clearBook']);
  } finally {
    releaseBookUrls(book);
  }
});

test('原生 EPUB 路径越界不会回退 JSZip', async () => {
  const epub = await buildEpub({
    items: [
      xhtmlItem('c1', 'Text/chapter.xhtml', 'OEBPS/Text/chapter.xhtml', '<h1>不应读取</h1>')
    ]
  });
  dom.window.__TAURI__ = {
    core: {
      invoke: async command => {
        const name = command.split('|').pop();
        if (name === 'openDocument') {
          throw 'NATIVE_SECURITY_LIMIT: 压缩包路径不在 HOMURA 存档目录内';
        }
        if (name === 'close' || name === 'clearBook') return null;
        throw new Error(`未模拟原生命令：${name}`);
      }
    }
  };

  try {
    await assert.rejects(
      parseEpubFile(epubFile(epub), {
        id: 'epub-native-security',
        nativePath: '../outside/book.epub'
      }),
      error => error.code === 'NATIVE_SECURITY_LIMIT'
    );
  } finally {
    delete dom.window.__TAURI__;
  }
});

test('原生文本被批次上限截断时递归补读剩余章节', async () => {
  const archiveId = 'epub-native-batched-text';
  const paths = Array.from({ length: 5 }, (_, index) => `OEBPS/Text/chapter-${index + 1}.xhtml`);
  let readCalls = 0;
  dom.window.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        const name = command.split('|').pop();
        if (name === 'openDocument') {
          return {
            archiveId: args.archiveId,
            entries: paths.map((path, index) => ({
              index,
              path,
              name: path,
              size: 20
            }))
          };
        }
        if (name === 'readTextBatch') {
          readCalls++;
          const requested = JSON.parse(args.pathsJson);
          return {
            texts: requested.slice(0, 1).map(path => ({
              path,
              text: `正文 ${path}`,
              size: 20
            }))
          };
        }
        if (name === 'close') return null;
        throw new Error(`未模拟原命令：${name}`);
      }
    }
  };

  const archive = await createNativeEpubArchive('book.epub', { id: archiveId });
  try {
    const texts = await archive.readTexts(paths);
    assert.deepEqual(texts, paths.map(path => `正文 ${path}`));
    assert.ok(readCalls > 1);
  } finally {
    await closeNativeArchive(archiveId);
  }
});

test('原生 EPUB 解析与 JSZip 保持相同的章节结果', async () => {
  const epub = await buildEpub({
    title: '双后端小说',
    items: [
      xhtmlItem(
        'c1',
        'Text/chapter1.xhtml',
        'OEBPS/Text/chapter1.xhtml',
        '<h1>原生第一章</h1><p>第一段正文。</p>'
      ),
      xhtmlItem(
        'c2',
        'Text/chapter2.xhtml',
        'OEBPS/Text/chapter2.xhtml',
        '<h2>原生第二章</h2><p>第二段正文。</p>'
      )
    ]
  });
  const jsZipBook = await parseEpubArchive(
    await createJsZipEpubArchive(epub.bytes),
    { id: 'epub-jszip-parity', fallbackTitle: '文件名' }
  );

  const entries = Array.from(epub.entries.entries());
  dom.window.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        const name = command.split('|').pop();
        if (name === 'openDocument') {
          return {
            archiveId: args.archiveId,
            entries: entries.map(([path, bytes], index) => ({
              index,
              path,
              name: path,
              size: bytes.length
            }))
          };
        }
        if (name === 'readTextBatch') {
          const requested = JSON.parse(args.pathsJson);
          return {
            texts: requested.flatMap(path => {
              const bytes = epub.entries.get(path);
              return bytes ? [{ path, text: decoder.decode(bytes), size: bytes.length }] : [];
            })
          };
        }
        if (name === 'close' || name === 'clearBook') return null;
        throw new Error(`未模拟原生命令：${name}`);
      }
    }
  };

  const nativeId = 'epub-native-parity';
  const nativeBook = await parseEpubNativeArchive(
    'homura-native-sources/epub-native-parity/source/book.epub',
    { id: nativeId, name: '原生文件名.epub' }
  );

  try {
    const shape = book => ({
      type: book.type,
      format: book.format,
      title: book.title,
      pageCount: book.pageCount,
      chapters: book.chapters.map(chapter => ({
        title: chapter.title,
        htmlContent: chapter.htmlContent
      }))
    });
    assert.deepEqual(shape(nativeBook), shape(jsZipBook));
    assert.equal(nativeBook.nativeArchiveId, nativeId);
    assert.equal(nativeBook.nativeArchiveMode, 'document');
    assert.equal(nativeBook.nativeArchivePath, 'homura-native-sources/epub-native-parity/source/book.epub');
    assert.equal(nativeBook.nativeEntryIndexByPath instanceof Map, true);
    assert.equal(nativeBook.nativeEntryIndexByPath.get('OEBPS/Text/chapter1.xhtml'), 3);
    assert.equal(nativeBook.nativeEntryIndexByPath.get('OEBPS/Text/chapter2.xhtml'), 4);
    assert.equal(nativeBook.zipContent, undefined);
  } finally {
    releaseBookUrls(jsZipBook);
    releaseBookUrls(nativeBook);
    await closeNativeArchive(nativeId);
  }
});
