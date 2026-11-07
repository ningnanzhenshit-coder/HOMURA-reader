import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseMobiBuffer } from '../src/services/mobi.js';
import { sanitizeEpubHtml } from '../src/services/sanitize.js';

const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.NodeFilter = window.NodeFilter;

// 回归测试：MOBI 曾用一套独立的黑名单净化（BLOCKED_TAGS + sanitizeInto），
// 与 EPUB 的白名单净化（sanitize.js）各自演化，出现防护漂移。
// 下面对同一批 payload 要求两条路径给出同等的净化强度。
// 实测确认过的漂移点：<template> 内容不被遍历、xlink:href 从不过检、
// video/audio/track 的 src 不校验、class 属性存活、SVG 动画元素存活。

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg7sAAAAASUVORK5CYII=',
  'base64'
);

function mobiBytes(html) {
  const body = Buffer.from(html);
  const header = Buffer.alloc(248);
  header.writeUInt16BE(1);
  header.writeUInt32BE(body.length, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(4096, 10);
  header.write('MOBI', 16);
  header.writeUInt32BE(232, 20);
  header.writeUInt32BE(65001, 28);
  header.writeUInt32BE(2, 108);
  const records = [header, body, png, png];
  const pdb = Buffer.alloc(78 + records.length * 8 + 2);
  pdb.write('BOOKMOBI', 60);
  pdb.writeUInt16BE(records.length, 76);
  let offset = pdb.length;
  records.forEach((record, index) => {
    pdb.writeUInt32BE(offset, 78 + index * 8);
    offset += record.length;
  });
  return new Uint8Array(Buffer.concat([pdb, ...records]));
}

function mobiHtml(payload) {
  const parsed = parseMobiBuffer(mobiBytes('<p>正文</p>' + payload));
  const html = (parsed.chapters || []).map(chapter => chapter.htmlContent || '').join('\n');
  for (const url of parsed.resourceUrls || []) URL.revokeObjectURL(url);
  return html;
}

// 每个 payload 都要求 EPUB 与 MOBI 一致拦截；断言写成对两条路径同时生效。
const blocked = [
  ['template 内的 img onerror', '<template><img src=x onerror="alert(1)"></template>', /onerror|<img/i],
  ['svg animate 改写 href', '<svg><a><animate attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>', /<animate|javascript:/i],
  ['svg set 改写 href', '<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>', /<set|javascript:/i],
  ['foreignObject 嵌套 HTML', '<svg><foreignObject><div onclick="alert(1)">x</div></foreignObject></svg>', /foreignObject|onclick/i],
  ['use 的 xlink:href 外链', '<svg><use xlink:href="http://evil.tld/s.svg#a"/></svg>', /xlink:href|evil\.tld/i],
  ['use 的 xlink:href data URI', '<svg><use xlink:href="data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%2F%3E"/></svg>', /xlink:href|data:/i],
  ['image 的 xlink:href 外链', '<svg><image xlink:href="http://evil.tld/x.png"/></svg>', /xlink:href|evil\.tld/i],
  ['video 远程 src', '<video src="http://evil.tld/t.mp4"></video>', /<video|evil\.tld/i],
  ['audio 远程 src', '<audio src="http://evil.tld/a.mp3"></audio>', /<audio|evil\.tld/i],
  ['track 远程 src', '<video><track src="http://evil.tld/v.vtt"></video>', /<track|evil\.tld/i],
  ['video poster 远程图片', '<video poster="http://evil.tld/p.png"></video>', /poster|evil\.tld/i],
  ['img 远程 src', '<img src="http://evil.tld/i.png">', /evil\.tld/i],
  ['iframe srcdoc', '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>', /<iframe|srcdoc/i],
  ['script 直插', '<script>alert(1)</script>', /<script/i],
  ['style 直插', '<style>@import "http://evil.tld/x.css";</style>', /<style|evil\.tld/i],
  ['a 的 javascript: href', '<a href="javascript:alert(1)">点我</a>', /javascript:/i],
  ['a 的实体编码 javascript:', '<a href="&#106;avascript:alert(1)">点我</a>', /javascript:/i],
  ['a 的 data:text/html href', '<a href="data:text/html,<b>x</b>">点我</a>', /data:/i],
  ['任意事件属性', '<p onclick="alert(1)" onmouseover="alert(2)">正文</p>', /onclick|onmouseover/i],
  ['style 属性', '<p style="position:fixed;inset:0">正文</p>', /style=/i],
  ['class 借 Tailwind 覆盖界面', '<div class="fixed inset-0 z-50 bg-white">伪造界面</div>', /class=/i],
  ['srcset 外部图片', '<img srcset="http://evil.tld/a.png 1x" src="data:image/png;base64,AAAA">', /srcset|evil\.tld/i]
];

for (const [name, payload, forbidden] of blocked) {
  test(`[EPUB] ${name} 被拦截`, () => {
    assert.ok(!forbidden.test(sanitizeEpubHtml(payload)), `EPUB 净化后不应残留 ${forbidden}`);
  });
  test(`[MOBI] ${name} 被拦截`, () => {
    assert.ok(!forbidden.test(mobiHtml(payload)), `MOBI 净化后不应残留 ${forbidden}`);
  });
}

// ---- 净化不能过度：正常排版元素必须保留 ----

test('两路径一致保留常规排版标签', () => {
  const html = '<p>段落 <strong>粗</strong> <em>斜</em></p><table><tr><td>格</td></tr></table>'
    + '<ruby>汉<rt>kan</rt></ruby><blockquote>引</blockquote>';
  for (const [label, out] of [['EPUB', sanitizeEpubHtml(html)], ['MOBI', mobiHtml(html)]]) {
    for (const tag of ['<p>', '<strong>', '<em>', '<table>', '<td>', '<ruby>', '<rt>', '<blockquote>']) {
      assert.ok(out.includes(tag), `${label} 应保留 ${tag}，实际输出 ${out}`);
    }
  }
});

test('两路径一致放行 http/https/mailto/tel 链接', () => {
  const html = '<a href="https://ok.example/a">1</a><a href="mailto:a@b.com">2</a><a href="tel:123">3</a>';
  for (const [label, out] of [['EPUB', sanitizeEpubHtml(html)], ['MOBI', mobiHtml(html)]]) {
    assert.ok(out.includes('href="https://ok.example/a"'), `${label} 应保留 https 链接`);
    assert.ok(out.includes('href="mailto:a@b.com"'), `${label} 应保留 mailto 链接`);
    assert.ok(out.includes('href="tel:123"'), `${label} 应保留 tel 链接`);
  }
});

// ---- recindex 解引用回归：白名单净化器会拒绝 blob: URL，
// 所以必须在净化前占位、净化后再写回，否则 MOBI 图片会全部消失 ----

test('MOBI recindex 图片仍解析为 blob URL', () => {
  const parsed = parseMobiBuffer(mobiBytes('<p>有字<img recindex="1"></p>'));
  const html = parsed.chapters.map(chapter => chapter.htmlContent).join('\n');
  assert.ok(/src="blob:/.test(html), `recindex 应解析成 blob: src，实际输出 ${html}`);
  assert.ok(!/__homura_rec_/.test(html), '净化占位串不应残留到最终 HTML');
  for (const url of parsed.resourceUrls) URL.revokeObjectURL(url);
});

test('MOBI 无 recindex 且非内嵌位图的图片被移除', () => {
  const html = mobiHtml('<img src="images/broken.jpg"><p>正文</p>');
  assert.ok(!html.includes('<img'), '无法解析的相对图片应被移除，而不是留下坏图');
});

test('MOBI 保留内嵌 data:image 位图', () => {
  const html = mobiHtml('<img src="data:image/png;base64,iVBORw0KGgo="><p>正文</p>');
  assert.ok(html.includes('src="data:image/png;base64,'), '内嵌位图应保留');
});

test('MOBI 内部 filepos 锚点仍被拆除', () => {
  const html = mobiHtml('<a filepos="12">内部锚点</a><p>正文</p>');
  assert.ok(!html.includes('<a'), '无 href 的 filepos 锚点不应渲染成假链接');
  assert.ok(html.includes('内部锚点'), '锚点文字应保留');
});
