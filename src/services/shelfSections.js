import { resolveBookFormat } from './utils.js';

export function bookShelfCategory(book) {
  const format = resolveBookFormat(book);
  if (format === 'pdf') return 'other';
  if (book.type === 'manga') return 'manga';
  if (['epub', 'txt', 'markdown', 'mobi'].includes(format) || ['novel', 'epub'].includes(book.type)) return 'novel';
  return 'other';
}

export function groupShelfBooks(books) {
  return [{ key: 'novel', title: '小说' }, { key: 'manga', title: '漫画' }, { key: 'other', title: '其他' }]
    .map(section => ({ ...section, books: books.filter(book => bookShelfCategory(book) === section.key) }))
    .filter(section => section.books.length);
}
