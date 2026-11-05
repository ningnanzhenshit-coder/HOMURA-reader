import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseMobiBuffer } from '../src/services/mobi.js';
import { buildActivePages } from '../src/services/pagination.js';
import { applyRestoredProgress } from '../src/services/progress.js';

const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg7sAAAAASUVORK5CYII=', 'base64');

function mobiFile(html) {
  const body = Buffer.from(html);
  const header = Buffer.alloc(248);
  header.writeUInt16BE(1);
  header.writeUInt32BE(body.length, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(4096, 10);
  header.write('MOBI', 16);
  header.writeUInt32BE(232, 20);
  header.writeUInt32BE(65001, 28);
  header.writeUInt32BE(2, 108);
  const records = [header, body, png, png];
  const pdb = Buffer.alloc(78 + records.length * 8 + 2);
  pdb.write('BOOKMOBI', 60);
  pdb.writeUInt16BE(records.length, 76);
  let offset = pdb.length;
  records.forEach((record, index) => {
    pdb.writeUInt32BE(offset, 78 + index * 8);
    offset += record.length;
  });
  return new File([Buffer.concat([pdb, ...records])], 'sample.mobi');
}

test('纯图 MOBI 按正文出现顺序保留每张图，翻页与条漫使用相同页数', async () => {
  const file = mobiFile('<p><a filepos="12"><img recindex="2"></a><font>&nbsp;</font><img recindex="1"></p><mbp:pagebreak/><p><img recindex="2"></p>');
  const parsed = parseMobiBuffer(await file.arrayBuffer());
  try {
    assert.equal(parsed.pageItems?.length, 3);
    assert.equal(parsed.pageItems[0].url, parsed.pageItems[2].url);
    assert.notEqual(parsed.pageItems[0].url, parsed.pageItems[1].url);
    for (const direction of ['ltr', 'rtl', 'vertical']) {
      assert.deepEqual(buildActivePages({ type: 'manga', pageItems: parsed.pageItems }, { direction }).map(page => page.pageNumber), [1, 2, 3]);
    }
  } finally {
    for (const url of parsed.resourceUrls) URL.revokeObjectURL(url);
  }
});

test('有正文的 MOBI 保留小说排版和单独插图章节', async () => {
  const file = mobiFile('<p><img recindex="1"></p><mbp:pagebreak/><p>小说正文</p>');
  const parsed = parseMobiBuffer(await file.arrayBuffer());
  try {
    assert.equal(parsed.pageItems, null);
    assert.equal(parsed.chapters.length, 2);
    assert.match(parsed.chapters[0].htmlContent, /<img[^>]+blob:/);
    assert.match(parsed.chapters[1].htmlContent, /小说正文/);
  } finally {
    for (const url of parsed.resourceUrls) URL.revokeObjectURL(url);
  }
});

test('旧版两页 MOBI 的末页记录不会跳到整本漫画的最后一张图', () => {
  const book = { id: 'mobi_saved', type: 'manga', format: 'mobi' };
  const pages = Array.from({ length: 28 }, (_, index) => ({ pageNumber: index + 1 }));
  assert.equal(applyRestoredProgress(book, pages, { mobi_saved: { type: 'novel', index: 1, ratio: 1 } }), 1);
  assert.equal(applyRestoredProgress(book, pages, { mobi_saved: { type: 'manga', index: 27, ratio: 1 } }), 27);
});
