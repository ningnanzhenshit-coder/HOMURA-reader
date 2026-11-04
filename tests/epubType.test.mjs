import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldReadEpubAsManga } from '../src/services/epubType.js';

test('带封面与多页彩插的轻小说仍按小说解析', () => {
  // 《药师少女的独语》第一卷：35 个 spine，33 章正文，封面 + 6 张彩插。
  assert.equal(shouldReadEpubAsManga({
    chapterCount: 35,
    textChapterCount: 33,
    imageHeavyChapterCount: 2,
    imageCount: 7
  }), false);
});

test('插图页接近半数的轻小说不会丢失正文', () => {
  // 第 15 卷：55 个 spine 中有 20 个纯插图页，但仍有 34 章正文。
  assert.equal(shouldReadEpubAsManga({
    chapterCount: 55,
    textChapterCount: 34,
    imageHeavyChapterCount: 20,
    imageCount: 20
  }), false);
});

test('纯图片 EPUB 继续走漫画直读', () => {
  assert.equal(shouldReadEpubAsManga({
    chapterCount: 154,
    textChapterCount: 0,
    imageHeavyChapterCount: 154,
    imageCount: 154
  }), true);
});

test('漫画 EPUB 夹一页版权文字仍按漫画解析', () => {
  assert.equal(shouldReadEpubAsManga({
    chapterCount: 51,
    textChapterCount: 1,
    imageHeavyChapterCount: 50,
    imageCount: 50
  }), true);
});

test('无图、无正文页或空统计时不误判漫画', () => {
  assert.equal(shouldReadEpubAsManga({
    chapterCount: 10,
    textChapterCount: 10,
    imageHeavyChapterCount: 0,
    imageCount: 0
  }), false);
  assert.equal(shouldReadEpubAsManga({}), false);
  assert.equal(shouldReadEpubAsManga(), false);
});
