import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/services/markdown.js';

// 回归测试：Markdown 链接文本曾是未转义拼进 <a> 的 HTML 注入点（存储型 XSS）
test('链接文本中的 img onerror 会被转义', () => {
  const html = renderMarkdown('[<img src=x onerror="window.__PWNED__=1">](https://example.com)');
  assert.ok(html.includes('&lt;img'), 'img 标签应被转义');
  assert.ok(!html.includes('<img'), '不允许出现活 img 标签');
  assert.ok(html.includes('href="https://example.com"'), '合法链接本身应保留');
});

test('不安全 href 降级分支同样转义链接文本', () => {
  const html = renderMarkdown('[<svg onload="window.__PWNED__=2">](javascript:void(0))');
  assert.ok(!html.includes('<svg'), '不允许出现活 svg 标签');
  assert.ok(html.includes('&lt;svg'), 'svg 应被转义显示');
});

test('正文原始 HTML 保持转义（原有行为）', () => {
  const html = renderMarkdown('<script>window.__PWNED__=3</script>');
  assert.ok(html.includes('&lt;script&gt;'));
});

test('javascript: 链接不生成可点击 href（原有行为）', () => {
  const html = renderMarkdown('[点我](javascript:alert(1))');
  assert.ok(!html.includes('javascript:'));
});

test('普通链接与内联格式不受影响', () => {
  const html = renderMarkdown('[a *b* c](https://example.com)');
  assert.ok(html.includes('<a href="https://example.com">'));
  assert.ok(html.includes('<em>b</em>'), '链接文本内的内联强调应保留');
});

test('标题中的链接与正文链接都安全', () => {
  const md = '# 标题\n\n[<img src=x onerror=alert(1)>](https://example.com)\n\n正文';
  const html = renderMarkdown(md);
  assert.ok(!html.includes('<img'), '整篇渲染后不允许出现活 img 标签');
});
