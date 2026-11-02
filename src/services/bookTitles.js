/* ============================================================================
   HOMURA · 书名排序与同名识别
   ========================================================================== */

import { pinyin } from 'pinyin-pro';

const titleCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
  ignorePunctuation: true
});
const sortKeys = new WeakMap();

export function normalizeBookTitle(title) {
  return String(title || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function titleSortKey(book) {
  const title = normalizeBookTitle(book.title);
  const cached = sortKeys.get(book);
  if (cached && cached.title === title) return cached;
  // 使用词组读音处理“重庆”等多音词；书名号等开头标点不参与排序。
  const text = title.replace(/^[\p{P}\p{Z}]+/u, '');
  const phonetic = pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive', v: true }).join('');
  const group = /^[0-9]/.test(phonetic) ? 0 : /^[a-z]/i.test(phonetic) ? 1 : 2;
  const key = { title, phonetic, group };
  sortKeys.set(book, key);
  return key;
}

export function compareBookTitles(a, b) {
  const keyA = titleSortKey(a);
  const keyB = titleSortKey(b);
  return keyA.group - keyB.group
    || titleCollator.compare(keyA.phonetic, keyB.phonetic)
    || titleCollator.compare(keyA.title, keyB.title);
}

export function findSameTitleBook(books, title) {
  const normalized = normalizeBookTitle(title);
  if (!normalized) return null;
  return books.find(book => normalizeBookTitle(book.title) === normalized) || null;
}

export function sortShelfBooks(books, key = 'title', progressMap = {}) {
  const list = [...books];
  if (key === 'title') list.sort(compareBookTitles);
  if (key === 'progress') list.sort((a, b) => (progressMap[b.id]?.updatedAt || 0) - (progressMap[a.id]?.updatedAt || 0));
  return list;
}
