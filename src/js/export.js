/* ============================================================================
   HOMURA · 离线导出
   ----------------------------------------------------------------------------
   把当前页面依赖的本地 CSS / JS 内联进一份 HTML，导出可离线打开的单文件阅读器。
   导出时会把 ES Module 按依赖顺序展平成一段普通脚本，避免相对 import 失效。
   ========================================================================== */

import { showToast } from './core.js';

// 展平顺序 = 依赖顺序：被依赖的模块在前，入口在最后
const MODULE_FILES = [
  'storage.js', 'core.js', 'demo.js', 'bookshelf.js', 'parsers.js',
  'restore.js', 'importer.js', 'pagination.js', 'reader.js',
  'renderer.js', 'export.js', 'init.js', 'main.js'
];

function flattenModule(code) {
  return code
    .replace(/^\s*import\s[^;]*;\s*$/gm, '')
    .replace(/^\s*export\s+/gm, '');
}

export async function downloadSelf() {
  const root = document.documentElement.cloneNode(true);

  try {
    // 1. 把入口模块及其依赖展平成一段普通脚本
    const entry = root.querySelector('script[type="module"][src]');
    if (entry) {
      const entryUrl = new URL(entry.getAttribute('src'), document.baseURI);
      const chunks = [];
      for (const file of MODULE_FILES) {
        const res = await fetch(new URL(file, entryUrl), { cache: 'no-store' });
        if (!res.ok) throw new Error('加载失败: ' + file);
        chunks.push(flattenModule(await res.text()));
      }
      const script = document.createElement('script');
      script.textContent = chunks.join('\n\n');
      entry.replaceWith(script);
    }

    // 2. 内联剩余的本地 CSS 与经典脚本（Tailwind、JSZip 等）
    const localAssets = [...root.querySelectorAll('link[rel="stylesheet"][href], script[src]')]
      .filter(el => {
        const url = el.getAttribute(el.tagName === 'LINK' ? 'href' : 'src') || '';
        return url && !/^(?:[a-z]+:|\/\/)/i.test(url);
      });

    await Promise.all(localAssets.map(async el => {
      const isLink = el.tagName === 'LINK';
      const res = await fetch(el.getAttribute(isLink ? 'href' : 'src'), { cache: 'no-store' });
      if (!res.ok) throw new Error(`加载失败: ${el.getAttribute(isLink ? 'href' : 'src')}`);
      const text = await res.text();

      if (isLink) {
        const style = document.createElement('style');
        style.textContent = text;
        el.replaceWith(style);
      } else {
        el.removeAttribute('src');
        el.textContent = text;
      }
    }));
  } catch (e) {
    showToast('导出失败：本地样式/脚本读取不到，请用本地服务器打开页面');
    return;
  }

  const html = '<!DOCTYPE html>\n' + root.outerHTML;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Homura_Reader_UltraSmooth.html';
  a.click();
  showToast('已导出单文件离线阅读器！');
}
