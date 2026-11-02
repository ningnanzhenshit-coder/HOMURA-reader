import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBookTitles, findSameTitleBook, normalizeBookTitle } from '../src/services/bookTitles.js';

const sortedTitles = titles => titles.map(title => ({ title })).sort(compareBookTitles).map(book => book.title);

test('数字自然排序，中文拼音与英文字母混排', () => {
  assert.deepEqual(
    sortedTitles(['Zebra', '香蕉', 'Apple', '《阿甘》', 'Banana', '波纹', '10号', '2号', '1号']),
    ['1号', '2号', '10号', '《阿甘》', 'Apple', 'Banana', '波纹', '香蕉', 'Zebra']
  );
});

test('使用词组读音处理多音字，同一系列按卷号自然排序', () => {
  assert.deepEqual(
    sortedTitles(['上海', '重庆10', '北京', '重庆2', '长安', '重庆1']),
    ['北京', '长安', '重庆1', '重庆2', '重庆10', '上海']
  );
});

test('缓存随书名变化更新，排序不改写书名', () => {
  const book = { title: 'Ｚｅｂｒａ' };
  assert.ok(compareBookTitles(book, { title: 'Apple' }) > 0);
  book.title = '  《阿甘》  ';
  assert.ok(compareBookTitles(book, { title: 'Apple' }) < 0);
  assert.equal(book.title, '  《阿甘》  ');
});

test('同名检测忽略首尾空白、全半角和英文大小写', () => {
  const book = { title: '  Ａｌｐｈａ　旅程  ' };
  assert.equal(normalizeBookTitle(book.title), 'alpha 旅程');
  assert.equal(findSameTitleBook([book], 'alpha   旅程'), book);
});

test('同音不同字、不同卷号和不同标点的书名不误判为重名', () => {
  const books = [{ title: '时间' }, { title: 'Volume 1' }, { title: '《阿甘》' }];
  for (const title of ['实践', 'Volume 01', 'Volume 2', '阿甘', '', undefined]) {
    assert.equal(findSameTitleBook(books, title), null);
  }
});

test('同名检测覆盖当前批次已入架的书，排序兼容空书名', () => {
  const books = [];
  assert.equal(findSameTitleBook(books, '星降之夜'), null);
  const first = { title: '星降之夜' };
  books.push(first);
  assert.equal(findSameTitleBook(books, '星降之夜'), first);
  assert.doesNotThrow(() => sortedTitles([undefined, '', '星降之夜', '1号']));
});
