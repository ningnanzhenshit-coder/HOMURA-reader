import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { splitLongParagraph } from '../src/services/pagination.js';

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
