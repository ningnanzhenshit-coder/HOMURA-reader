/* ============================================================================
   HOMURA · EPUB 漫画 / 小说判定
   ----------------------------------------------------------------------------
   图片型 EPUB 直接走漫画管道，省去逐章重排；但轻小说的封面和整页彩插
   同样是零文字页，只看图片数量会把“封面 + 数张彩插”的轻小说误判成漫画，
   导入后只剩几页插图、正文全部丢失。这里额外检查正文页占比，有实质正文
   时始终按小说解析。
   ========================================================================== */

// 单页正文达到这个长度才算“有字的章节”，用于排除封面与纯插图页。
export const TEXT_CHAPTER_MIN_LENGTH = 60;

// 有字章节占比超过这个值时一定按小说读，图片再多也只作为插图。
const TEXT_CHAPTER_RATIO_LIMIT = 0.15;
// 图片页占全部章节的这个比例时，可以视为纯图片书。
const IMAGE_HEAVY_CHAPTER_RATIO = 0.45;
// 少量纯图片章节仍可能是画集 / 条漫合订本。
const MIN_MANGA_IMAGE_COUNT = 6;

export function shouldReadEpubAsManga({
  chapterCount = 0,
  textChapterCount = 0,
  imageHeavyChapterCount = 0,
  imageCount = 0
} = {}) {
  if (chapterCount <= 0 || imageHeavyChapterCount <= 0 || imageCount <= 0) return false;
  // 漫画 EPUB 的 spine 几乎全是零文字图片页；轻小说即使彩插很多，正文页仍占多数。
  if (textChapterCount / chapterCount > TEXT_CHAPTER_RATIO_LIMIT) return false;
  return imageHeavyChapterCount >= chapterCount * IMAGE_HEAVY_CHAPTER_RATIO
    || imageCount >= MIN_MANGA_IMAGE_COUNT;
}
