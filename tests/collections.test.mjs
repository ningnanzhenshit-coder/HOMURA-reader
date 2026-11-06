import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCollectionBooks, restoreCollections, planFolderCollections, collectionNameError } from '../src/services/collections.js';

test('批量移动只保留一个归属，移回主页不删除书本', () => {
  const original = [{ id: 'a', title: '甲', bookIds: ['1', '2'] }, { id: 'b', title: '乙', bookIds: ['3'] }];
  const moved = moveCollectionBooks(original, ['1', '3', '1'], 'b');
  assert.deepEqual(moved.map(item => item.bookIds), [['2'], ['1', '3']]);
  assert.deepEqual(original[0].bookIds, ['1', '2']);
  assert.deepEqual(moveCollectionBooks(moved, ['1', '3'], null).map(item => item.bookIds), [['2'], []]);
  assert.throws(() => moveCollectionBooks(original, ['1'], 'missing'));
});

test('恢复时去除失效与重复归属，保留空书库', () => {
  const restored = restoreCollections([
    { id: 'a', title: '甲', bookIds: ['1', '1', 'gone'], mangaLayout: { direction: 'vertical', webtoonFit: 'wide' } },
    { id: 'b', title: '乙', bookIds: ['1', '2'] },
    { id: 'c', title: '空书库', bookIds: [] }
  ], [{ id: '1' }, { id: '2' }]);
  assert.deepEqual(restored.map(item => item.bookIds), [['1'], ['2'], []]);
  assert.deepEqual(restored[0].mangaLayout, { direction: 'vertical', webtoonFit: 'wide' });
});

test('目录逐层展平为独立书库，不合并同名子目录', () => {
  const files = [
    { name: '1.txt', customRelativePath: '书籍/甲/同名/1.txt' },
    { name: '2.epub', customRelativePath: '书籍/乙/同名/2.epub' },
    { name: '3.cbz', customRelativePath: '书籍/3.cbz' },
    { name: '.hidden.txt', customRelativePath: '书籍/.hidden.txt' },
    { name: 'notes.exe', customRelativePath: '书籍/notes.exe' }
  ];
  const plan = planFolderCollections(files);
  assert.equal(plan.bookCount, 3);
  assert.deepEqual(plan.groups.map(item => item.path), ['书籍/甲/同名', '书籍/乙/同名', '书籍']);
  assert.equal(plan.hasDirectories, true);
});

test('散装图片每个目录算一本漫画，混合文档保持独立', () => {
  const plan = planFolderCollections([
    { name: '01.png', webkitRelativePath: '漫画/第一卷/01.png' },
    { name: '02.png', webkitRelativePath: '漫画/第一卷/02.png' },
    { name: '01.png', webkitRelativePath: '漫画/第二卷/01.png' },
    { name: '说明.md', webkitRelativePath: '漫画/第二卷/说明.md' }
  ]);
  assert.deepEqual(plan.groups.map(item => [item.title, item.bookCount, item.files.length]), [['第一卷', 1, 2], ['第二卷', 2, 2]]);
});

test('书库名称校验支持重命名并避免全半角同名', () => {
  const collections = [{ id: 'a', title: 'ＡＢＣ' }];
  assert.ok(collectionNameError('', collections));
  assert.ok(collectionNameError('abc', collections));
  assert.equal(collectionNameError('abc', collections, 'a'), '');
  assert.ok(collectionNameError('长'.repeat(81), collections));
});
