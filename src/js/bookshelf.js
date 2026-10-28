/* ============================================================================
   HOMURA · 书架
   ----------------------------------------------------------------------------
   书架网格渲染、标题转义、单本移除与清空。
   ========================================================================== */

import { state, showToast } from './core.js';
import { HomuraStore } from './storage.js';
import { progressInfoFor } from './progress.js';


export function renderBookshelf() {
  const grid = document.getElementById('bookshelfGrid');
  const countEl = document.getElementById('shelfCount');
  if (!grid) return;

  countEl.innerText = `${state.library.length} 本作品`;

  if (state.library.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-14 text-center text-[var(--fg-muted)] text-xs font-medium">
        书架暂无作品，请拖入文件或点击上方「导入文件 / 导入文件夹」
      </div>
    `;
    return;
  }

  grid.innerHTML = state.library.map(book => {
    const badgeText = book.type === 'manga' ? '漫画' : (book.type === 'epub' ? 'EPUB' : '小说');
    const subInfo = book.type === 'manga'
      ? `共 ${book.pageCount || (book.pageItems ? book.pageItems.length : 0)} 页`
      : `共 ${book.pageCount || (book.chapters ? book.chapters.length : 1)} 章`;
    const prog = progressInfoFor(book.id);

    const coverHtml = book.cover
      ? `<img src="${book.cover}" class="manga-page-img w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" />`
      : `<div style="background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover));" class="w-full h-full p-4 flex flex-col justify-between text-white">
          <span class="text-[10px] font-mono font-bold tracking-widest opacity-80">ACGN·GO</span>
          <div class="font-display font-bold text-sm line-clamp-3 leading-snug text-white">${escapeHtml(book.title)}</div>
          <span class="text-[10px] opacity-80 font-mono">${subInfo}</span>
        </div>`;

    const progressBarHtml = prog
      ? `<div class="absolute bottom-0 inset-x-0 h-[3px] bg-slate-900/25">
          <div class="h-full" style="width: ${prog.percent}%; background-color: var(--brand-primary);"></div>
        </div>`
      : '';

    return `
      <div onclick="openBook('${book.id}')" class="editorial-card group cursor-pointer overflow-hidden flex flex-col">
        <div class="aspect-[3/4] w-full bg-[var(--bg-subtle)] relative overflow-hidden border-b border-[var(--border-line)]">
          ${coverHtml}
          <span style="background-color: var(--brand-primary);" class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold text-white shadow">
            ${badgeText}
          </span>
          <button onclick="removeBook('${book.id}', event)" class="absolute top-2.5 right-2.5 w-6 h-6 rounded-md bg-slate-900/75 hover:bg-red-600 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition" title="从书架移除">
            ✕
          </button>
          ${progressBarHtml}
        </div>
        <div class="p-3 flex-1 flex flex-col justify-between gap-1.5">
          <h4 class="font-bold text-xs line-clamp-2 leading-snug group-hover:text-[var(--brand-primary)] transition">
            ${escapeHtml(book.title)}
          </h4>
          <div class="flex items-center justify-between text-[11px] font-mono text-[var(--fg-muted)] pt-1">
            <span>${subInfo}</span>
            <span class="text-[var(--brand-primary)] font-bold">${prog ? `读至 ${prog.percent}%` : '阅读 →'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

export function removeBook(id, ev) {
  if (ev) ev.stopPropagation();
  state.library = state.library.filter(b => b.id !== id);
  renderBookshelf();
  HomuraStore.deleteBook(id).catch(() => {});
  showToast('已从书架移除该作品');
}

export function clearShelf() {
  state.library = [];
  renderBookshelf();
  HomuraStore.clear().catch(() => {});
  showToast('已清空书架');
}
