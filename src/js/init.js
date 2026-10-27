/* ============================================================================
   HOMURA · 启动入口
   ----------------------------------------------------------------------------
   恢复上次的主题与阅读表面，载入本地书架；空书架时放入示例书。
   ========================================================================== */

import { showToast, setThemeColor, setSurfaceMode } from './core.js';
import { HomuraStore } from './storage.js';
import { restoreLibrary } from './restore.js';
import { loadDemoManga, loadDemoNovel } from './demo.js';
import { renderBookshelf } from './bookshelf.js';


window.addEventListener('DOMContentLoaded', async () => {
  let savedTheme = 'blue';
  let savedMode = 'light';
  try {
    savedTheme = localStorage.getItem('homura_theme_color') || 'blue';
    savedMode = localStorage.getItem('homura_surface_mode') || 'light';
  } catch (e) {}

  setThemeColor(savedTheme, true);
  setSurfaceMode(savedMode, true);

  // 书架上一次导入的作品会从 IndexedDB 里恢复；第一次使用才放示例书
  const hasStoredBooks = await restoreLibrary();
  if (!hasStoredBooks) {
    loadDemoNovel(false);
    loadDemoManga(false);
  }
  renderBookshelf();

  if (HomuraStore.disabled) {
    showToast('提示：当前环境无法保存书架，请通过本地服务器打开页面');
  }
});
