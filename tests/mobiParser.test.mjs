import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseMobiBuffer } from '../src/services/mobi.js';
import { ensurePageUrlLoaded, releaseBookPageUrls } from '../src/services/pagination.js';

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

function writeExth(buf, base, entries) {
  const encoded = entries.map(([id, value]) => {
    const data = new TextEncoder().encode(value);
    const record = new Uint8Array(8 + data.length);
    writeU32(record, 0, id);
    writeU32(record, 4, 8 + data.length);
    record.set(data, 8);
    return record;
  });
  const length = 12 + encoded.reduce((sum, record) => sum + record.length, 0);
  buf.set(new TextEncoder().encode('EXTH'), base);
  writeU32(buf, base + 4, length);
  writeU32(buf, base + 8, encoded.length);
  let offset = base + 12;
  encoded.forEach(record => {
    buf.set(record, offset);
    offset += record.length;
  });
}

// 构造最小 MOBI：1 个文本记录 + 若干图片记录
function buildMobi({ text, images = [jpeg, broken], exth = [] } = {}) {
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
  writeU16(buf, rec0, 1); // 无压缩
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
  if (exth.length) writeExth(buf, rec0 + 248, exth);

  let cursor = headerSize;
  records.forEach((record, index) => {
    if (index > 0) buf.set(record, cursor);
    cursor += record.length;
  });
  return buf;
}

const novelText = [
  '<html><body>',
  '<p>第一章</p>',
  '<mbp:pagebreak/>',
  '<div><img recindex="1" alt="第 2 頁"></div>',
  '<mbp:pagebreak/>',
  '<div><img recindex="2" alt="第 3 頁"></div>',
  '</body></html>'
].join('');

const comicText = [
  '<html><body>',
  '<div><img recindex="1" alt="第 1 頁"></div>',
  '<mbp:pagebreak/>',
  '<div><img recindex="2" alt="第 2 頁"></div>',
  '<mbp:pagebreak/>',
  '<div><img recindex="3" alt="第 3 頁"></div>',
  '</body></html>'
].join('');

test('MOBI 图片页不会因为没有文字被丢弃', () => {
  const data = parseMobiBuffer(buildMobi({ text: novelText }), 'fallback');

  assert.equal(data.type, 'novel');
  assert.equal(data.title, '测试 MOBI');
  assert.equal(data.chapters.length, 3);
  assert.equal(data.chapters[0].title, '第一章');
  assert.equal(data.chapters[1].title, '第 2 頁');
  assert.match(data.chapters[1].htmlContent, /<img[^>]+src="blob:/);
});

test('MOBI 损坏图片保留占位页，页码不被吞掉', () => {
  const data = parseMobiBuffer(buildMobi({ text: novelText }), 'fallback');
  const last = data.chapters[2];

  assert.equal(last.title, '第 3 頁');
  assert.match(last.htmlContent, /mobi-missing-page/);
  assert.match(last.htmlContent, /第 3 頁 · 图片数据缺失/);
});

test('comic MOBI 走漫画管道并按记录区间生成页面', () => {
  const data = parseMobiBuffer(buildMobi({
    text: comicText,
    images: [jpeg, jpeg, broken],
    exth: [[123, 'comic'], [527, 'rtl']]
  }), 'fallback');

  assert.equal(data.type, 'manga');
  assert.equal(data.chapters.length, 0);
  assert.equal(data.pages.length, 3);
  assert.equal(data.readingDirection, 'rtl');
  assert.ok(data.pages[0].start < data.pages[0].end);
  assert.equal(data.pages[2].start, null);
});

test('无 comic 标记但纯图片且页数足够时也走漫画管道', () => {
  const images = Array.from({ length: 6 }, () => jpeg);
  const text = images.map((_, index) => (
    `<div><img recindex="${index + 1}" alt="第 ${index + 1} 頁"></div>${index < 5 ? '<mbp:pagebreak/>' : ''}`
  )).join('');
  const data = parseMobiBuffer(buildMobi({ text, images }), 'fallback');

  assert.equal(data.type, 'manga');
  assert.equal(data.pages.length, 6);
});

test('MOBI 漫画页按记录区间懒加载，回收后能重新切出', async () => {
  const bytes = buildMobi({
    text: comicText,
    images: [jpeg, jpeg, broken],
    exth: [[123, 'comic']]
  });
  const file = new File([bytes], 'comic.mobi');
  const data = parseMobiBuffer(bytes, 'fallback');
  const page = data.pages[0];
  const item = {
    mobiFile: file,
    mobiRange: [page.start, page.end],
    mobiMime: page.mime,
    url: null
  };
  const book = { type: 'manga', cover: null, pageItems: [item] };

  assert.match(await ensurePageUrlLoaded(item), /^blob:/);
  releaseBookPageUrls(book);
  assert.equal(item.url, '');
  assert.match(await ensurePageUrlLoaded(item), /^blob:/);
});
