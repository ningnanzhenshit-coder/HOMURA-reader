import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { splitLongParagraph, collectNovelBlocks, buildActivePages } from '../src/services/pagination.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.NodeFilter = dom.window.NodeFilter;

test('长段落中的 br 与行内标记可安全跨页拆分', () => {
  const prefix = '甲乙丙。🙂'.repeat(24);
  const suffix = '丁戊己。🙂'.repeat(24);
  const html = `<p><strong>${prefix}</strong><br><em>${suffix}</em></p>`;
  const maxHeight = 320;
  const measurer = document.createElement('div');

  Object.defineProperty(measurer, 'scrollHeight', {
    get() {
      const breakHeight = this.querySelectorAll('br').length * 40;
      return (this.textContent.length + breakHeight) * 10;
    }
  });

  const parts = splitLongParagraph(html, measurer, maxHeight);
  assert.ok(parts.length > 1, '超长段落应拆成多页');

  const roundTrip = document.createElement('div');
  let text = '';
  let breaks = 0;
  for (const part of parts) {
    roundTrip.innerHTML = part;
    text += roundTrip.textContent;
    breaks += roundTrip.querySelectorAll('br').length;
    assert.equal(roundTrip.firstElementChild.tagName, 'P');
    assert.ok(measurer.scrollHeight <= maxHeight, '每个分页片段都不应超过可用高度');
  }

  assert.equal(text, prefix + suffix);
  assert.equal(breaks, 1);
  assert.ok(parts.some(part => part.includes('<strong>')));
  assert.ok(parts.some(part => part.includes('<em>')));
});

test('含不可拆分媒体时保留原始段落', () => {
  const html = '<p>正文<img src="cover.jpg" alt=""></p>';
  const measurer = document.createElement('div');
  Object.defineProperty(measurer, 'scrollHeight', { value: 1000 });
  assert.deepEqual(splitLongParagraph(html, measurer, 100), [html]);
});

test('含插图的 EPUB 章节容器会拆成独立 blocks', () => {
  const html = `
    <section>
      <h1>插图</h1>
      <figure><svg><image href="one.jpg"></image></svg></figure>
      <figure><svg><image href="two.jpg"></image></svg></figure>
      <p>正文段落</p>
    </section>
  `;
  const blocks = collectNovelBlocks(html);

  assert.deepEqual(blocks.map(block => block.type), ['h1', 'figure', 'figure', 'p']);
  assert.match(blocks[1].html, /one\.jpg/);
  assert.match(blocks[2].html, /two\.jpg/);
});

test('容器内混有直接文本时保留原容器，避免丢字', () => {
  const html = '<div>前置文字<figure><img src="one.jpg" alt=""></figure>后置文字</div>';
  const blocks = collectNovelBlocks(html);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'div');
  assert.match(blocks[0].html, /前置文字/);
  assert.match(blocks[0].html, /后置文字/);
});

test('MOBI 的空字体标签不会让独立漫画图退回正文排版', () => {
  const image = '<img src="blob:local-page" alt="漫画页">';
  const book = { type: 'novel', chapters: [
    { htmlContent: `<p>${image}<font size="2">&nbsp;</font></p>` },
    { htmlContent: `<p>${image}<font size="2">图注</font></p>` },
    { htmlContent: `<p>${image}${image}</p>` }
  ] };
  const pages = buildActivePages(book, { direction: 'ltr', spread: 2, fontSize: 18 }, document.createElement('div'));

  assert.deepEqual(pages[0].illustration, { src: 'blob:local-page', alt: '漫画页' });
  assert.equal(pages[1].illustration, null);
  assert.equal(pages[2].illustration, null);
});
