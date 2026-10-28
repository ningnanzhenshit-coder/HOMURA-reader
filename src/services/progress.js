/* ============================================================================
   HOMURA · 阅读进度记忆
   ----------------------------------------------------------------------------
   把每本书的当前位置按比例写进 IndexedDB，重开时按新分页结果换算出页码。
   写盘做了 350ms 防抖，避免连续翻页刷盘。
   本模块不持有状态：reader / shelf store 由调用方传入。
   ========================================================================== */

import { HomuraStore } from './storage.js';

const SAVE_DEBOUNCE_MS = 350;
let saveTimer = null;

function makeRecord(reader) {
  const book = reader.currentBook;
  const total = reader.activePages.length;
  if (!book || total === 0) return null;
  const lastIdx = Math.max(0, total - 1);
  const index = Math.min(lastIdx, Math.max(0, reader.currentIndex));
  const currentPage = reader.activePages[index];
  return {
    id: book.id,
    type: book.type,
    index,
    total,
    ratio: lastIdx > 0 ? index / lastIdx : 0,
    chapterIndex: currentPage && typeof currentPage.chapterIndex === 'number' ? currentPage.chapterIndex : 0,
    // 每本书自己的排版：方向 / 单双页 / 首页单排 / 字号 / 条漫尺寸
    layout: {
      direction: reader.layoutConfig.direction,
      spread: reader.layoutConfig.spread,
      coverOffset: reader.layoutConfig.coverOffset,
      fontSize: reader.layoutConfig.fontSize,
      webtoonFit: reader.layoutConfig.webtoonFit
    },
    updatedAt: Date.now()
  };
}

function writeCurrentProgress(reader, shelf) {
  const record = makeRecord(reader);
  if (!record) return Promise.resolve();
  // 先同步更新内存表，书架重绘时能立刻读到最新百分比
  shelf.setProgressRecord(record);
  return HomuraStore.saveProgress(record).catch(() => {});
}

// 启动时把整张进度表读进内存，书架渲染可以直接同步读取
export async function loadProgressMap() {
  try {
    const list = await HomuraStore.listProgress();
    const map = {};
    list.forEach(rec => {
      if (rec && rec.id) map[rec.id] = rec;
    });
    return map;
  } catch (err) {
    return {};
  }
}

// 在 buildActivePages() 之后调用：按比例换算出新分页下的位置；返回 -1 表示无记录
export function applyRestoredProgress(book, activePages, progressMap) {
  const rec = book && progressMap[book.id];
  if (!rec || activePages.length === 0) return -1;
  const lastIdx = Math.max(0, activePages.length - 1);
  const ratio = typeof rec.ratio === 'number' ? rec.ratio : 0;
  return Math.min(lastIdx, Math.max(0, Math.round(ratio * lastIdx)));
}

export function scheduleProgressSave(reader, shelf) {
  if (!reader.currentBook) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeCurrentProgress(reader, shelf);
  }, SAVE_DEBOUNCE_MS);
}

export function flushProgress(reader, shelf) {
  clearTimeout(saveTimer);
  saveTimer = null;
  return writeCurrentProgress(reader, shelf);
}

// 关窗 / 切后台时兜底刷写，防止防抖窗口内的最后一次翻页丢失
export function installProgressFlushHooks(reader, shelf) {
  window.addEventListener('beforeunload', () => { flushProgress(reader, shelf); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushProgress(reader, shelf);
  });
}
