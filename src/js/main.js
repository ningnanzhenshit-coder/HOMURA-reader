/* ============================================================================
   HOMURA · ES Module 入口
   ----------------------------------------------------------------------------
   按依赖顺序汇总所有模块，并把 HTML 内联事件需要的函数挂到 window。
   ========================================================================== */

import './storage.js';
import { setThemeColor, setSurfaceMode, toggleTransitionStyle, toggleFullScreen } from './core.js';
import { loadDemoManga, loadDemoNovel } from './demo.js';
import { removeBook, clearShelf } from './bookshelf.js';
import './parsers.js';
import './restore.js';
import './importer.js';
import './pagination.js';
import {
  openBook, closeReader, setDirection, setSpreadCount,
  toggleCoverOffset, toggleWebtoonWidth, changeFontSize,
  toggleRtlTapInvert, onLeftButtonClick, onRightButtonClick, onSliderInput
} from './reader.js';
import './renderer.js';
import { downloadSelf } from './export.js';
import './init.js';

// HTML 与生成出来的卡片/翻页区使用内联 onclick，这里统一暴露到全局
Object.assign(window, {
  setThemeColor,
  setSurfaceMode,
  toggleTransitionStyle,
  toggleFullScreen,
  loadDemoManga,
  loadDemoNovel,
  removeBook,
  clearShelf,
  openBook,
  closeReader,
  setDirection,
  setSpreadCount,
  toggleCoverOffset,
  toggleWebtoonWidth,
  changeFontSize,
  toggleRtlTapInvert,
  onLeftButtonClick,
  onRightButtonClick,
  onSliderInput,
  downloadSelf
});
