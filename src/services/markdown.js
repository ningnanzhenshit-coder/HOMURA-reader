/* ============================================================================
   HOMURA · Markdown 渲染
   ----------------------------------------------------------------------------
   .md 文件先转成 HTML，再走小说渲染管道。这里的输出会进 v-html，
   所以刻意关掉原始 HTML 注入、并过滤链接协议，避免笔记里夹带脚本。
   ========================================================================== */

import { Marked } from 'marked';
import { escapeHtml, isSafeLinkUrl } from './utils.js';

const marked = new Marked({
  gfm: true,
  // 中文笔记习惯一句一行，单换行也当硬换行处理
  breaks: true,
  async: false
});

marked.use({
  renderer: {
    // 原始 HTML 一律转义展示，不交给浏览器执行
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, text }) {
      if (!isSafeLinkUrl(href)) return text;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${titleAttr}>${text}</a>`;
    },
    image({ href, text }) {
      if (!isSafeLinkUrl(href)) return escapeHtml(text || '');
      const titleAttr = text ? ` alt="${escapeHtml(text)}"` : '';
      return `<img src="${escapeHtml(href)}"${titleAttr}>`;
    }
  }
});

export function renderMarkdown(source) {
  return marked.parse(source, { async: false });
}
