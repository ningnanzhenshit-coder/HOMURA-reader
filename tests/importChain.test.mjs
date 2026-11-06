import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// pdf.js 的 worker 用 ?url 导入，node 不认；把它替换成假地址即可。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('?url')) {
      return {
        url: 'data:text/javascript,' + encodeURIComponent('export default "fake-worker.mjs";'),
        shortCircuit: true
      };
    }
    return nextResolve(specifier, context);
  }
});

const { buildImageFolderBooks, isJunkImagePath } = await import('../src/services/parsers.js');

function imageFile(name, size = 10) {
  return new File([new Uint8Array(size)], name);
}

function withRelativePath(file, path) {
  Object.defineProperty(file, 'customRelativePath', { value: path, writable: false });
  return file;
}

test('识别 macOS 元数据目录与资源分叉文件', () => {
  assert.equal(isJunkImagePath('manga/__MACOSX/._001.jpg'), true);
  assert.equal(isJunkImagePath('__MACOSX'), true);
  assert.equal(isJunkImagePath('manga/._001.jpg'), true);
  assert.equal(isJunkImagePath('.DS_Store'), true);
  assert.equal(isJunkImagePath('manga/chapter/001.jpg'), false);
  // 只是名字里带 Mac 的普通目录不能被误杀
  assert.equal(isJunkImagePath('MACOSX漫展/001.jpg'), false);
  assert.equal(isJunkImagePath(''), false);
});

test('__MACOSX 里的图片不会变成幽灵漫画书', () => {
  const files = [
    withRelativePath(imageFile('001.jpg'), 'manga/vol1/001.jpg'),
    withRelativePath(imageFile('002.jpg'), 'manga/vol1/002.jpg'),
    withRelativePath(imageFile('._001.jpg'), 'manga/vol1/._001.jpg'),
    withRelativePath(imageFile('001.jpg'), 'manga/__MACOSX/vol1/._001.jpg')
  ];

  const books = buildImageFolderBooks(files);
  assert.equal(books.length, 1);
  assert.equal(books[0].folderName, 'vol1');
  assert.equal(books[0].book.pageCount, 2, '资源分叉不能算作页面');
  assert.deepEqual(books[0].files.map(file => file.name), ['001.jpg', '002.jpg']);
});

test('只有垃圾文件的目录不会生成空书', () => {
  const books = buildImageFolderBooks([
    withRelativePath(imageFile('._cover.jpg'), 'manga/__MACOSX/._cover.jpg'),
    withRelativePath(imageFile('a.jpg'), 'manga/__MACOSX/a.jpg')
  ]);
  assert.deepEqual(books, []);
});

test('没有相对路径的单张图片仍按文件名成书', () => {
  const books = buildImageFolderBooks([imageFile('cover.jpg')]);
  assert.equal(books.length, 1);
  assert.equal(books[0].folderName, 'cover');
  assert.equal(books[0].book.pageCount, 1);
});
