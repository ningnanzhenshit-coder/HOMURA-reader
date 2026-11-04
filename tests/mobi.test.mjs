import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseMobiBuffer } from '../src/services/mobi.js';

const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.NodeFilter = window.NodeFilter;

const html = Buffer.from('<h1>第一章</h1><p>你好，世界。</p>');
const illustration = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg7sAAAAASUVORK5CYII=', 'base64');

function huffmanRecords({ cyclic = false } = {}) {
  // 0xff → 普通正文；0xfe → 引用正文的压缩词条。
  const huff = Buffer.alloc(24 + 256 * 4 + 32 * 8);
  huff.write('HUFF');
  huff.writeUInt32BE(24, 4);
  huff.writeUInt32BE(24, 8);
  huff.writeUInt32BE(24 + 256 * 4, 12);
  for (let i = 0; i < 256; i++) huff.writeUInt32BE(0xff88, 24 + i * 4);

  const cdic = Buffer.alloc(16 + 4 + 2 + html.length + 2 + 1);
  cdic.write('CDIC');
  cdic.writeUInt32BE(16, 4);
  cdic.writeUInt32BE(2, 8);
  cdic.writeUInt32BE(1, 12);
  cdic.writeUInt16BE(4, 16);
  cdic.writeUInt16BE(6 + html.length, 18);
  cdic.writeUInt16BE(0x8000 | html.length, 20);
  html.copy(cdic, 22);
  cdic.writeUInt16BE(1, 22 + html.length);
  cdic[24 + html.length] = cyclic ? 0xfe : 0xff;
  return [huff, cdic];
}

function makeMobi({ compression = 17480, encryption = 0, version = 6, cyclic = false, body = html } = {}) {
  const title = Buffer.from('测试书');
  const header = Buffer.alloc(16 + 232 + title.length);
  header.writeUInt16BE(compression);
  header.writeUInt32BE(body.length, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(4096, 10);
  header.writeUInt16BE(encryption, 12);
  header.write(encryption === 1 ? 'XXXX' : 'MOBI', 16);
  header.writeUInt32BE(232, 20);
  header.writeUInt32BE(65001, 28);
  header.writeUInt32BE(version, 36);
  header.writeUInt32BE(16 + 232, 84);
  header.writeUInt32BE(title.length, 88);
  header.writeUInt32BE(compression === 17480 ? 4 : 2, 108);
  header.writeUInt32BE(2, 112);
  header.writeUInt32BE(2, 116);
  header.writeUInt32BE(3, 240);
  title.copy(header, 248);

  const palmDoc = [];
  for (let i = 0; i < body.length; i += 8) {
    const chunk = body.subarray(i, i + 8);
    palmDoc.push(chunk.length, ...chunk);
  }
  const text = compression === 17480 ? [0xfe] : compression === 2 ? palmDoc : [...body];
  // 多字节尾部的长度为 2，后一项反向编码长度也是 2。
  const records = [header, Buffer.from([...text, 0x78, 1, 0xaa, 0x82])];
  if (compression === 17480) records.push(...huffmanRecords({ cyclic }));
  records.push(illustration);

  const pdb = Buffer.alloc(78 + records.length * 8 + 2);
  pdb.write(encryption === 1 ? 'TEXtREAd' : 'BOOKMOBI', 60);
  pdb.writeUInt16BE(records.length, 76);
  let offset = pdb.length;
  records.forEach((record, i) => {
    pdb.writeUInt32BE(offset, 78 + i * 8);
    offset += record.length;
  });
  return Buffer.concat([pdb, ...records]);
}

test('读取带尾部数据和嵌套词条的 Huffman MOBI，保留中文与封面', () => {
  const book = parseMobiBuffer(makeMobi());
  assert.equal(book.title, '测试书');
  assert.deepEqual(book.chapters, [{ title: '第一章', htmlContent: html.toString() }]);
  assert.equal(book.coverBlob.type, 'image/png');
});

test('普通和 PalmDOC 压缩的 MOBI 仍可阅读', () => {
  for (const compression of [1, 2]) {
    const book = parseMobiBuffer(makeMobi({ compression }));
    assert.equal(book.chapters[0].htmlContent, html.toString());
  }
});

test('循环词条和截断文件会被拒绝，DRM 与 KF8 有各自的错误原因', () => {
  assert.throws(() => parseMobiBuffer(makeMobi({ cyclic: true })), { code: 'BAD_FILE' });
  assert.throws(() => parseMobiBuffer(makeMobi().subarray(0, 89)), { code: 'BAD_FILE' });
  assert.throws(() => parseMobiBuffer(makeMobi({ encryption: 1 })), { code: 'DRM' });
  assert.throws(() => parseMobiBuffer(makeMobi({ encryption: 2 })), { code: 'DRM' });
  assert.throws(() => parseMobiBuffer(makeMobi({ version: 8 })), { code: 'KF8' });
});

test('内嵌图片保留，链接后的书内脚本、事件和 SVG 动画不会进入阅读器', () => {
  const body = Buffer.from('<p><a filepos="12">目录</a><script>danger()</script><img recindex="1" onerror="danger()"><svg><animate attributeName="href" values="javascript:danger()"/></svg></p>');
  const book = parseMobiBuffer(makeMobi({ compression: 1, body }));
  try {
    assert.match(book.chapters[0].htmlContent, /<img src="blob:/);
    assert.doesNotMatch(book.chapters[0].htmlContent, /script|onerror|animate/);
    assert.equal(book.resourceUrls.length, 1);
  } finally {
    for (const url of book.resourceUrls) URL.revokeObjectURL(url);
  }
});
