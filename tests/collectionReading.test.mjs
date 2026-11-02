import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionReadingOrder, adjacentCollectionBook, spreadBounds } from '../src/services/collectionReading.js';
import { bookShelfCategory, groupShelfBooks } from '../src/services/shelfSections.js';

test('类别筛选兼容旧书，PDF 与未知类型归其他，图像类 EPUB 仍归漫画', () => {
  const books = [
    { id: 'pdf_old', type: 'manga' },
    { id: 'unrecognized', type: 'document' },
    { id: 'epub_comic', type: 'manga', format: 'epub' },
    { id: 'img_folder', type: 'manga' },
    { id: 'txt_old', type: 'novel' },
    { id: 'md_old' },
    { id: 'mobi_old' },
    { id: 'legacy', type: 'epub' }
  ];
  const ids = category => books.filter(book => bookShelfCategory(book) === category).map(book => book.id);
  assert.deepEqual(ids('other'), ['pdf_old', 'unrecognized']);
  assert.deepEqual(ids('manga'), ['epub_comic', 'img_folder']);
  assert.deepEqual(ids('novel'), ['txt_old', 'md_old', 'mobi_old', 'legacy']);
});

test('主页按小说、漫画、其他分组，保留各组原有排序', () => {
  const books = [
    { id: 'pdf', type: 'manga', format: 'pdf' }, { id: 'novel2', type: 'novel', format: 'txt' },
    { id: 'comic', type: 'manga', format: 'epub' }, { id: 'novel1', type: 'epub', format: 'epub' }, { id: 'unknown' }
  ];
  assert.deepEqual(groupShelfBooks(books).map(section => [section.title, section.books.map(book => book.id)]), [['小说', ['novel2', 'novel1']], ['漫画', ['comic']], ['其他', ['pdf', 'unknown']]]);
});

test('阅读期间固定书库顺序，已移出书本过滤，新书追加', () => {
  const books = [{ id: 'c' }, { id: 'b' }, { id: 'd' }];
  const order = collectionReadingOrder(books, ['a', 'b', 'c']);
  assert.deepEqual(order.map(book => book.id), ['b', 'c', 'd']);
  assert.equal(adjacentCollectionBook(order, 'c', -1).id, 'b');
  assert.equal(adjacentCollectionBook(order, 'c', 1).id, 'd');
  assert.equal(adjacentCollectionBook(order, 'b', -1), null);
  assert.equal(adjacentCollectionBook(order, 'd', 1), null);
  assert.equal(adjacentCollectionBook(order, 'missing', 1), null);
});

test('单双页与首页单排的可见边界覆盖奇偶页总数', () => {
  assert.deepEqual(spreadBounds(3, 5, true, true), { start: 3, end: 4 });
  assert.deepEqual(spreadBounds(0, 5, true, true), { start: 0, end: 0 });
  assert.deepEqual(spreadBounds(1, 4, true, false), { start: 0, end: 1 });
  assert.deepEqual(spreadBounds(2, 4, true, false), { start: 2, end: 3 });
  assert.deepEqual(spreadBounds(4, 5, true, false), { start: 4, end: 4 });
  assert.deepEqual(spreadBounds(2, 5, false, false), { start: 2, end: 2 });
  assert.deepEqual(spreadBounds(0, 0, true, true), { start: 0, end: -1 });
});
