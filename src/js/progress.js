/* ============================================================================
   HOMURA · 阅读进度记忆
   ----------------------------------------------------------------------------
   把每本书的当前位置按比例写进 IndexedDB，重开时按新分页结果换算出页码，
   并为书架提供同步读取的百分比信息。写盘做了 350ms 防抖，避免连续翻页刷盘。
   ========================================================================== */

import { state } from './core.js';
import { HomuraStore } from './storage.js';

const SAVE_DEBOUNCE_MS = 350;
let saveTimer = null;

function makeRecord() {
  const book = state.currentBook;
  const total = state.activePages.length;
  if (!book || total === 0) return null;
  const lastIdx = Math.max(0, total - 1);
  const index = Math.min(lastIdx, Math.max(0, state.currentIndex));
  const currentPage = state.activePages[index];
  return {
    id: book.id,
    type: book.type,
    index,
    total,
    ratio: lastIdx > 0 ? index / lastIdx : 0,
    chapterIndex: currentPage && typeof currentPage.chapterIndex === 'number' ? currentPage.chapterIndex : 0,
    // 每本书自己的排版：方向 / 单双页 / 首页单排 / 字号 / 条漫尺寸
    layout: {
      direction: state.layoutConfig.direction,
      spread: state.layoutConfig.spread,
      coverOffset: state.layoutConfig.coverOffset,
      fontSize: state.layoutConfig.fontSize,
      webtoonFit: state.layoutConfig.webtoonFit
    },
    updatedAt: Date.now()
  };
}

function writeCurrentProgress() {
  const record = makeRecord();
  if (!record) return Promise.resolve();
  // 先同步更新内存表，书架重绘时能立刻读到最新百分比
  state.progressMap[record.id] = record;
  return HomuraStore.saveProgress(record).catch(() => {});
}

// 启动时把整张进度表读进内存，书架渲染可以直接同步读取
export async function loadProgressIntoState() {
  try {
    const list = await HomuraStore.listProgress();
    state.progressMap = {};
    list.forEach(rec => {
      if (rec && rec.id) state.progressMap[rec.id] = rec;
    });
  } catch (err) {
    state.progressMap = {};
  }
}

// 在 buildActivePagesForBook() 之后调用：按比例换算出新分页下的位置
export function applyRestoredProgress(book) {
  const rec = book && state.progressMap[book.id];
  if (!rec || state.activePages.length === 0) return false;
  const lastIdx = Math.max(0, state.activePages.length - 1);
  const ratio = typeof rec.ratio === 'number' ? rec.ratio : 0;
  state.currentIndex = Math.min(lastIdx, Math.max(0, Math.round(ratio * lastIdx)));
  return state.currentIndex > 0;
}

export function scheduleProgressSave() {
  if (!state.currentBook) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeCurrentProgress();
  }, SAVE_DEBOUNCE_MS);
}

export function flushProgress() {
  clearTimeout(saveTimer);
  saveTimer = null;
  return writeCurrentProgress();
}

// 书架展示用：无记录或仍在第一页时不显示，避免满屏「读至 0%」
export function progressInfoFor(bookId) {
  const rec = state.progressMap[bookId];
  if (!rec) return null;
  const ratio = typeof rec.ratio === 'number' ? rec.ratio : 0;
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  if (percent <= 0) return null;
  return { percent, index: rec.index, total: rec.total, updatedAt: rec.updatedAt };
}

// 关窗 / 切后台时兜底刷写，防止防抖窗口内的最后一次翻页丢失
window.addEventListener('beforeunload', () => { flushProgress(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushProgress();
});
