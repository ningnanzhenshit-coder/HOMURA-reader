/* ============================================================================
   HOMURA · 书库连续阅读顺序与可见跨页边界
   ========================================================================== */

export function collectionReadingOrder(books, frozenIds = []) {
  const remaining = new Map(books.map(book => [book.id, book]));
  const ordered = [];
  for (const id of frozenIds) {
    if (!remaining.has(id)) continue;
    ordered.push(remaining.get(id));
    remaining.delete(id);
  }
  return [...ordered, ...remaining.values()];
}

export function adjacentCollectionBook(books, currentId, direction) {
  const index = books.findIndex(book => book.id === currentId);
  if (index < 0) return null;
  return books[index + direction] || null;
}

export function spreadBounds(index, total, double, coverOffset) {
  if (total <= 0) return { start: 0, end: -1 };
  const current = Math.max(0, Math.min(total - 1, index));
  if (!double || (coverOffset && current === 0)) return { start: current, end: current };
  const start = coverOffset ? current - (current % 2 === 0 ? 1 : 0) : current - current % 2;
  return { start, end: Math.min(total - 1, start + 1) };
}
