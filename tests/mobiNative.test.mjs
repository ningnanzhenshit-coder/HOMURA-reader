import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  parseMobiBuffer,
  parseMobiFileData
} from '../src/services/mobi.js';
import {
  NativeErrorCode,
  resetNativeRuntimeState
} from '../src/services/nativeRuntime.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const broken = new Uint8Array(16);

function writeU16(buf, offset, value) {
  buf[offset] = value >>> 8;
  buf[offset + 1] = value & 0xff;
}

function writeU32(buf, offset, value) {
  buf[offset] = value >>> 24;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function buildMobi({ text, images = [jpeg, broken] } = {}) {
  const textBytes = new TextEncoder().encode(text);
  const titleBytes = new TextEncoder().encode('测试 MOBI');
  const records = [new Uint8Array(1024), textBytes, ...images];
  const headerSize = 78 + records.length * 8 + 2;
  const total = headerSize + records.reduce((sum, record) => sum + record.length, 0);
  const buf = new Uint8Array(total);

  writeU16(buf, 76, records.length);
  let offset = headerSize;
  records.forEach((record, index) => {
    writeU32(buf, 78 + index * 8, offset);
    offset += record.length;
  });

  const rec0 = headerSize;
  writeU16(buf, rec0, 1);
  writeU32(buf, rec0 + 4, textBytes.length);
  writeU16(buf, rec0 + 8, 1);
  writeU16(buf, rec0 + 10, 4096);
  writeU16(buf, rec0 + 12, 0);
  buf.set(new TextEncoder().encode('MOBI'), rec0 + 16);
  writeU32(buf, rec0 + 20, 232);
  writeU32(buf, rec0 + 28, 65001);
  writeU32(buf, rec0 + 0x54, 700);
  writeU32(buf, rec0 + 0x58, titleBytes.length);
  writeU32(buf, rec0 + 0x6c, 2);
  buf.set(titleBytes, rec0 + 700);

  let cursor = headerSize;
  records.forEach((record, index) => {
    if (index > 0) buf.set(record, cursor);
    cursor += record.length;
  });
  return buf;
}

function installNative(invoke) {
  window.__TAURI__ = { core: { invoke } };
}

async function withoutNativeWarnings(run) {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return await run();
  } finally {
    console.warn = originalWarn;
  }
}

afterEach(() => {
  delete window.__TAURI__;
  resetNativeRuntimeState();
});

test('Tauri 环境优先调用 Rust，漫画页保留原文件区间', async () => {
  const fileBytes = new Uint8Array(128);
  fileBytes.set(jpeg, 32);
  fileBytes.set(jpeg, 64);
  const file = new File([fileBytes], 'native-comic.mobi');
  let request = null;
  installNative(async (command, args) => {
    request = { command, args };
    return {
      title: '原生漫画',
      rawText: [
        '<html><body>',
        '<div><img recindex="1" alt="第 1 页"></div>',
        '<mbp:pagebreak/>',
        '<div><img recindex="2" alt="第 2 页"></div>',
        '</body></html>'
      ].join(''),
      compression: 2,
      encoding: 'utf-8',
      cdeType: 'comic',
      writingMode: '',
      pageProgression: 'rtl',
      imageRecords: [
        { recindex: 1, start: 32, end: 36, mime: 'image/jpeg' },
        { recindex: 2, start: 64, end: 68, mime: 'image/jpeg' }
      ],
      cover: { recindex: 1, start: 32, end: 36, mime: 'image/jpeg' }
    };
  });

  const data = await parseMobiFileData(file, '兜底书名');

  assert.equal(request.command, 'parse_mobi_container');
  assert.deepEqual(
    Array.from(Buffer.from(request.args.bytesBase64, 'base64')),
    Array.from(fileBytes)
  );
  assert.equal(request.args.fallbackTitle, '兜底书名');
  assert.equal(data.type, 'manga');
  assert.equal(data.title, '原生漫画');
  assert.equal(data.compression, 2);
  assert.equal(data.readingDirection, 'rtl');
  assert.deepEqual(data.pages.map(page => [page.start, page.end]), [[32, 36], [64, 68]]);
  assert.equal(data.coverBlob.size, jpeg.length);
});

test('原生解析失败时回退完整 JS 解析', async () => {
  const bytes = buildMobi({
    text: '<html><body><h1>第一章</h1><p>正文内容</p></body></html>'
  });
  const file = new File([bytes], 'fallback.mobi');
  let calls = 0;
  installNative(async () => {
    calls++;
    throw new Error('MOBI 原生解析失败');
  });

  const data = await withoutNativeWarnings(() => parseMobiFileData(file, '兜底'));

  assert.equal(calls, 1);
  assert.equal(data.title, '测试 MOBI');
  assert.equal(data.type, 'novel');
  assert.equal(data.chapters[0].title, '第一章');
});

test('原生返回损坏图片区间时丢弃结果并回退 JS', async () => {
  const bytes = buildMobi({
    text: '<html><body><h1>回退</h1><p>正文</p></body></html>'
  });
  const file = new File([bytes], 'invalid-native.mobi');
  installNative(async () => ({
    title: '坏结果',
    rawText: '<html><body><img recindex="1"></body></html>',
    imageRecords: [{ recindex: 1, start: 20, end: 10, mime: 'image/jpeg' }],
    cover: null
  }));

  const data = await withoutNativeWarnings(() => parseMobiFileData(file, '兜底'));

  assert.equal(data.title, '测试 MOBI');
  assert.equal(data.chapters[0].title, '回退');
});

test('大小限制错误不会回退到 JS', async () => {
  const bytes = buildMobi({ text: '<p>正文</p>' });
  const file = new File([bytes], 'too-large.mobi');
  installNative(async () => {
    throw new Error('MOBI_TOO_LARGE: MOBI 文件过大');
  });

  await assert.rejects(
    parseMobiFileData(file, '兜底'),
    error => error.code === NativeErrorCode.LIMIT_EXCEEDED
  );
});

test('原生小说图片按 recindex 懒切片，缺失图片保留占位页', async () => {
  const fileBytes = new Uint8Array(96);
  fileBytes.set(jpeg, 48);
  const file = new File([fileBytes], 'native-novel.mobi');
  installNative(async () => ({
    title: '原生小说',
    rawText: [
      '<html><body>',
      '<h1>第一章</h1>',
      '<p>正文</p>',
      '<img recindex="1" alt="插图">',
      '<mbp:pagebreak/>',
      '<h1>第二章</h1>',
      '<img recindex="2" alt="缺失插图">',
      '</body></html>'
    ].join(''),
    compression: 1,
    encoding: 'utf-8',
    cdeType: '',
    writingMode: '',
    pageProgression: '',
    imageRecords: [{ recindex: 1, start: 48, end: 52, mime: 'image/jpeg' }],
    cover: null
  }));

  const data = await parseMobiFileData(file, '兜底');

  try {
    assert.equal(data.type, 'novel');
    assert.equal(data.resourceUrls.length, 1);
    assert.match(data.resourceUrls[0], /^blob:/);
    assert.match(data.chapters[0].htmlContent, /<img[^>]+src="blob:/);
    assert.match(data.chapters[1].htmlContent, /mobi-missing-page/);
    assert.match(data.chapters[1].htmlContent, /缺失插图 · 图片数据缺失/);
  } finally {
    data.resourceUrls.forEach(url => URL.revokeObjectURL(url));
  }
});

test('没有 Tauri 时解析入口直接使用 JS 兜底', async () => {
  const bytes = buildMobi({
    text: '<html><body><h1>第一章</h1><p>正文</p></body></html>'
  });
  const file = new File([bytes], 'browser.mobi');
  const data = await parseMobiFileData(file, '兜底');
  const jsData = parseMobiBuffer(bytes, '兜底');

  assert.equal(data.title, jsData.title);
  assert.equal(data.type, jsData.type);
  assert.equal(data.chapters[0].title, jsData.chapters[0].title);
  assert.equal(jsData.title, '测试 MOBI');
  assert.equal(jsData.type, 'novel');
  assert.equal(jsData.chapters[0].title, '第一章');
  assert.deepEqual(jsData.pages, []);
});
