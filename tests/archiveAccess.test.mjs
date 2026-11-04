import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasArchiveSource,
  readArchiveBlobByPath,
  readArchivePageBlob,
  readArchiveText
} from '../src/services/archiveAccess.js';

function zipBook() {
  const entries = new Map([
    ['OEBPS/one.xhtml', { async: async type => type === 'text' ? '<p>一</p>' : new Blob(['one']) }],
    ['OEBPS/two.xhtml', { async: async type => type === 'text' ? '<p>二</p>' : new Blob(['two']) }],
    ['OEBPS/image.jpg', { async: async type => type === 'blob' ? new Blob(['image']) : 'not-text' }]
  ]);
  return {
    zipContent: {
      file: path => entries.get(path) || null
    }
  };
}

test('压缩包文本读取保持请求顺序，缺失条目返回 null', async () => {
  const book = zipBook();
  const texts = await readArchiveText(book, [
    'OEBPS/two.xhtml',
    'OEBPS/missing.xhtml',
    'OEBPS/one.xhtml'
  ]);

  assert.deepEqual(texts, ['<p>二</p>', null, '<p>一</p>']);
});

test('压缩包图片按路径和页面条目读取', async () => {
  const book = zipBook();
  const byPath = await readArchiveBlobByPath(book, 'OEBPS/image.jpg');
  assert.equal(await byPath.text(), 'image');
  assert.equal(await readArchiveBlobByPath(book, 'OEBPS/missing.jpg'), null);

  const byPage = await readArchivePageBlob({
    zipEntry: {
      async: async type => type === 'blob' ? new Blob(['page']) : ''
    }
  });
  assert.equal(await byPage.text(), 'page');
});

test('原生与 JSZip 书本都能被识别为可读取压缩包', () => {
  assert.equal(hasArchiveSource(zipBook()), true);
  assert.equal(hasArchiveSource({ nativeArchiveId: 'book-1' }), true);
  assert.equal(hasArchiveSource({}), false);
});
