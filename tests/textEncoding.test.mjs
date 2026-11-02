import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeTxtBytes } from '../src/services/textEncoding.js';

test('UTF-8、ASCII、UTF-8 BOM 和表情符号不回退到旧编码', () => {
  for (const text of ['Hello world', '第一章 你好，世界。𠀀💫', '']) {
    const bytes = new TextEncoder().encode(text);
    assert.equal(decodeTxtBytes(bytes), text);
    assert.equal(decodeTxtBytes(bytes.buffer), text);
    assert.equal(decodeTxtBytes(Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes])), text);
  }
});

test('旧 GBK / GB2312 中文与 GB18030 四字节扩展字可正确读取', () => {
  const bytes = Uint8Array.from([181,218,210,187,213,194,32,196,227,186,195,163,172,202,192,189,231,161,163,13,10,181,218,182,254,213,194,32,178,226,202,212,149,50,130,54,148,57,218,53]);
  assert.equal(decodeTxtBytes(bytes), '第一章 你好，世界。\r\n第二章 测试𠀀💫');
  assert.equal(decodeTxtBytes(bytes.subarray(7, 19)), '你好，世界。');
});

test('UTF-16 大小端 BOM 优先于 UTF-8 判断', () => {
  const text = '第一章\r\n中文与 English 123 💫';
  const le = Buffer.from(text, 'utf16le');
  const be = Buffer.from(le).swap16();
  assert.equal(decodeTxtBytes(Buffer.concat([Buffer.from([0xff, 0xfe]), le])), text);
  assert.equal(decodeTxtBytes(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), text);
});

test('无 BOM UTF-16 交错零字节可识别，普通 ASCII 文本不被误识别', () => {
  const text = 'Chapter 1\n你好，世界。\nChapter 2\n中文与 English';
  const le = Buffer.from(text, 'utf16le');
  assert.equal(decodeTxtBytes(le), text);
  assert.equal(decodeTxtBytes(Buffer.from(le).swap16()), text);
  assert.equal(decodeTxtBytes(new TextEncoder().encode('Chapter 1\nHello, world!')), 'Chapter 1\nHello, world!');
});

test('识别不修改输入字节，非法尾字节不会使整个导入抛错', () => {
  const bytes = Uint8Array.from([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
  const before = bytes.slice();
  assert.equal(decodeTxtBytes(bytes), 'AB');
  assert.deepEqual(bytes, before);
  assert.doesNotThrow(() => decodeTxtBytes(Uint8Array.from([0x81])));
});
