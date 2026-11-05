<template>
  <!-- Manga: 纵向条漫瀑布流，图片懒加载 -->
  <div
    v-if="isManga"
    ref="scrollRoot"
    data-reader-scroll
    class="no-scrollbar w-full h-full overflow-y-auto overscroll-contain touch-pan-y flex flex-col items-center py-2 gap-2"
    style="scroll-padding-top: calc(3.5rem + env(safe-area-inset-top)); scroll-padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));"
  >
    <div
      v-for="(p, idx) in reader.activePages"
      :key="idx"
      :id="'webtoon-page-' + idx"
      class="webtoon-page w-full flex flex-col items-center justify-center shrink-0"
      :style="webtoonPageStyle(p)"
    >
      <img
        :data-lazy-index="idx"
        :width="p.imageWidth || undefined"
        :height="p.imageHeight || undefined"
        class="manga-page-img bg-[var(--bg-card)] shadow-sm rounded-sm select-none"
        :class="webtoonImageClass(p)"
        :alt="'第 ' + p.pageNumber + ' 页'"
        decoding="async"
        draggable="false"
      />
    </div>
    <div class="shrink-0" style="height: calc(4.5rem + env(safe-area-inset-bottom));" aria-hidden="true"></div>
  </div>

  <!-- Novel: 长卷连续滚动 -->
  <div
    v-else
    ref="scrollRoot"
    data-reader-scroll
    class="no-scrollbar w-full h-full overflow-y-auto overscroll-contain touch-pan-y py-4 px-3 sm:px-2"
    style="scroll-padding-top: calc(3.5rem + env(safe-area-inset-top)); scroll-padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));"
  >
    <div ref="novelContent" :style="{ fontSize: reader.layoutConfig.fontSize + 'px' }" class="max-w-[660px] mx-auto bg-[var(--md-surface-low)] border-[0.5px] border-[var(--md-outline-variant)] rounded-[16px] p-5 sm:p-12 space-y-8">
      <section
        v-for="p in reader.activePages"
        :key="p.pageNumber"
        :id="'webtoon-page-' + (p.pageNumber - 1)"
        data-novel-section
        class="webtoon-chapter border-b-[0.5px] border-[var(--border-line)] pb-6 last:border-none"
      >
        <div class="text-xs font-bold text-[var(--brand-primary)] mb-4 flex items-center gap-2">
          <span class="truncate">{{ p.title }}</span>
          <i class="block w-[0.5px] h-3 shrink-0 bg-current opacity-30"></i>
          <span class="shrink-0">第 {{ p.pageNumber }} 章</span>
        </div>
        <div class="epub-content font-sans leading-relaxed" v-html="p.html"></div>
      </section>
    </div>
    <div class="shrink-0" style="height: calc(4.5rem + env(safe-area-inset-bottom));" aria-hidden="true"></div>
  </div>
</template>

<script setup>
/* ============================================================================
   HOMURA · 纵向条漫 / 长卷滚动视图
   ----------------------------------------------------------------------------
   漫画走 IntersectionObserver 懒加载（rootMargin 800px 提前解码），
   小说整卷直出。滚动位置实时回写 currentIndex 并防抖存进度。
   ========================================================================== */

import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { decodePageImage, releaseDistantPageUrls } from '../services/pagination.js';

const reader = useReaderStore();
const scrollRoot = ref(null);
const novelContent = ref(null);
let scrollFrame = 0;
let novelOffsetFrame = 0;
let novelOffsets = [];
const mountedBookId = reader.currentBook?.id;
const mountedBook = reader.currentBook;
let disposed = false;
let boundsObserver = null;
let novelContentObserver = null;
let lastMangaImage = null;

const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

function hasPageSize(page) {
  return Number(page?.imageWidth) > 0 && Number(page?.imageHeight) > 0;
}

function webtoonPageStyle(page) {
  if (!hasPageSize(page)) return undefined;
  const width = Number(page?.imageWidth) || 0;
  const height = Number(page?.imageHeight) || 0;
  const ratio = width / height;
  const aspectRatio = `${width} / ${height}`;

  const fit = reader.layoutConfig.webtoonFit;
  if (fit === 'screen') {
    // 对应旧的 max-height + w-auto：宽度受容器、原图宽度和屏幕高度三重限制。
    const naturalWidth = width > 0 ? `${width}px` : '100%';
    return {
      width: `min(100%, min(${naturalWidth}, calc((100dvh - 6rem) * ${ratio})))`,
      aspectRatio
    };
  }
  return {
    width: fit === 'medium' ? 'min(100%, 720px)' : 'min(100%, 1024px)',
    aspectRatio
  };
}

function webtoonImageClass(page) {
  if (hasPageSize(page)) return 'block w-full h-full object-contain';
  const fit = reader.layoutConfig.webtoonFit;
  if (fit === 'screen') return 'max-h-[calc(100dvh-6rem)] w-auto max-w-full object-contain mx-auto';
  if (fit === 'medium') return 'w-full max-w-[720px] h-auto object-contain mx-auto';
  return 'w-full max-w-[1024px] h-auto object-contain mx-auto';
}

// 条漫滚出几屏后释放原图 URL，避免整本图的编码字节都留在内存里。
// img.src 交给 IntersectionObserver 的非可见分支清理，避免误清当前屏。
function releaseFarWebtoonPages(currentIdx) {
  releaseDistantPageUrls(mountedBook, currentIdx, 4);
}

// 清掉 src 会同步丢掉图片的固有高度，整卷高度瞬间缩短会把滚动位置带跑。
// 释放前把当前渲染高度钉在页面容器上，重新解码后再恢复自然布局。
function releaseImageElement(imgEl) {
  // 还在加载的页不要急着放掉：此时量到的是 alt 行高，会把整卷高度记小。
  if (!imgEl?.getAttribute('src') || !imgEl.complete || !imgEl.naturalHeight) return;
  const wrapper = imgEl.parentElement;
  const height = imgEl.getBoundingClientRect().height;
  if (wrapper && height > 0) {
    wrapper.style.height = `${height}px`;
    wrapper.dataset.placeholderHeight = '1';
  }
  imgEl.style.visibility = 'hidden';
  imgEl.removeAttribute('src');
  // 下次滚回来必须重新走 decode；只删 src 会命中 data-current-src 的旧判断。
  imgEl.removeAttribute('data-current-src');
}

function restoreImageElement(imgEl) {
  const wrapper = imgEl?.parentElement;
  if (wrapper?.dataset.placeholderHeight) {
    wrapper.style.height = '';
    delete wrapper.dataset.placeholderHeight;
  }
  if (imgEl) imgEl.style.visibility = '';
}

// 章节位置只在尺寸变化时量一次，滚动时用二分查找当前章。
// 之前每帧 querySelectorAll + 逐章 getBoundingClientRect，长篇小说会把主线程吃满。
function measureNovelOffsets() {
  const root = scrollRoot.value;
  if (!root || disposed || isManga.value) {
    novelOffsets = [];
    return;
  }
  const sections = root.querySelectorAll('section[data-novel-section]');
  const rootTop = root.getBoundingClientRect().top;
  const scrollTop = root.scrollTop;
  novelOffsets = Array.from(sections, section => section.getBoundingClientRect().top - rootTop + scrollTop);
}

function scheduleNovelOffsetMeasure() {
  if (disposed || isManga.value || novelOffsetFrame) return;
  novelOffsetFrame = requestAnimationFrame(() => {
    novelOffsetFrame = 0;
    measureNovelOffsets();
  });
}

function ensureNovelOffsets() {
  if (novelOffsets.length !== reader.activePages.length) measureNovelOffsets();
}

function findNovelSectionIndex(probe) {
  let low = 0;
  let high = novelOffsets.length - 1;
  let result = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (novelOffsets[middle] <= probe) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

function syncNovelScrollPosition() {
  if (disposed || reader.currentBook?.id !== mountedBookId) return;
  const root = scrollRoot.value;
  if (!root || isManga.value || reader.activePages.length === 0) return;

  ensureNovelOffsets();
  const probe = root.scrollTop + root.clientHeight * 0.45;
  let nextIndex = novelOffsets.length ? findNovelSectionIndex(probe) : 0;
  // 末章较短时可能始终到不了阅读线，滚到底部仍应记到最后一章。
  const canScroll = root.scrollHeight > root.clientHeight + 2;
  if (canScroll && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
    nextIndex = reader.activePages.length - 1;
  }

  if (nextIndex === reader.currentIndex) return;
  reader.currentIndex = nextIndex;
  reader.pageIndicator = `${nextIndex + 1} / ${reader.activePages.length}`;
  reader.sliderValue = nextIndex;
  reader.touchProgress();
}

function onScroll() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    syncScrollBounds();
    if (!isManga.value) syncNovelScrollPosition();
  });
}

function syncScrollBounds() {
  const root = scrollRoot.value;
  if (!root || disposed || reader.currentBook?.id !== mountedBookId) return;
  if (isManga.value && (!lastMangaImage || !lastMangaImage.isConnected)) {
    lastMangaImage = root.querySelector(`img[data-lazy-index="${reader.activePages.length - 1}"]`);
  }
  const atStart = root.scrollTop <= 2;
  const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 2
    && (!isManga.value || !!(lastMangaImage?.complete && lastMangaImage.naturalHeight));
  const previous = reader.webtoonBounds;
  if (previous.atStart === atStart && previous.atEnd === atEnd) return;
  reader.webtoonBounds = { atStart, atEnd };
}

function onContentLoad() {
  syncScrollBounds();
  scheduleNovelOffsetMeasure();
}

function scrollToSection(index, behavior = 'auto') {
  const root = scrollRoot.value;
  if (!root) return;
  if (isManga.value) {
    const target = root.querySelector('#webtoon-page-' + index);
    if (target) target.scrollIntoView({ behavior, block: 'start' });
    return;
  }
  ensureNovelOffsets();
  if (Number.isFinite(novelOffsets[index])) {
    // scrollTo 不走 scroll-padding，手动减去顶部工具栏预留高度。
    const paddingTop = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    root.scrollTo({ top: Math.max(0, novelOffsets[index] - paddingTop), behavior });
  }
}

onMounted(() => {
  const total = reader.activePages.length;
  reader.pageIndicator = `${reader.currentIndex + 1} / ${total}`;
  reader.sliderValue = reader.currentIndex;
  scrollRoot.value.addEventListener('scroll', onScroll, { passive: true });
  scrollRoot.value.addEventListener('load', onContentLoad, true);
  boundsObserver = new ResizeObserver(() => {
    syncScrollBounds();
    scheduleNovelOffsetMeasure();
  });
  boundsObserver.observe(scrollRoot.value);
  if (!isManga.value && novelContent.value) {
    novelContentObserver = new ResizeObserver(scheduleNovelOffsetMeasure);
    novelContentObserver.observe(novelContent.value);
  }

  // 注册滚动入口：store 的翻页 / 滑条动作在条漫模式下转成滚动
  reader.webtoonScrollBy = dir => {
    const el = scrollRoot.value;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.88, behavior: 'smooth' });
  };
  reader.webtoonScrollTo = idx => scrollToSection(idx, 'smooth');

  if (isManga.value) {
    // 当前页前后各预载几页，避免恢复进度时白屏
    for (let i = Math.max(0, reader.currentIndex - 1); i <= Math.min(total - 1, reader.currentIndex + 2); i++) {
      const pageData = reader.activePages[i];
      const el = scrollRoot.value && scrollRoot.value.querySelector(`img[data-lazy-index="${i}"]`);
      if (pageData && el) {
        decodePageImage(el, pageData.itemRef, { preserveSrcOnEmpty: true }).then(ok => { if (ok) restoreImageElement(el); });
      }
    }

    reader.webtoonObserver = new IntersectionObserver(entries => {
      const intersecting = [];
      entries.forEach(async entry => {
        if (disposed || reader.currentBook?.id !== mountedBookId) return;
        const lazyIndex = parseInt(entry.target.getAttribute('data-lazy-index'), 10);
        // 已经滚出预载区的页先丢掉位图，回滚时会按需重新解出
        if (!entry.isIntersecting && Number.isFinite(lazyIndex)
          && Math.abs(lazyIndex - reader.currentIndex) > 2
          && entry.target.getAttribute('src')) {
          releaseImageElement(entry.target);
        }
        if (entry.isIntersecting) {
          intersecting.push({ index: lazyIndex, rect: entry.boundingClientRect });
          const imgEl = entry.target;
          const idx = lazyIndex;
          const pageData = reader.activePages[idx];
          if (pageData) {
            const ok = await decodePageImage(imgEl, pageData.itemRef, { preserveSrcOnEmpty: true });
            if (ok) restoreImageElement(imgEl);
            if (disposed || reader.currentBook?.id !== mountedBookId) return;
          }
        }
      });

      // 解码完成顺序不等于阅读顺序。当前页按视口 45% 阅读线选最近的一页，
      // 避免开卷时并发解码把页码一路推到最后一页。
      if (!intersecting.length || disposed || reader.currentBook?.id !== mountedBookId) return;
      const rootRect = scrollRoot.value?.getBoundingClientRect();
      if (!rootRect) return;
      const probe = rootRect.top + (scrollRoot.value?.clientHeight || 0) * 0.45;
      let best = intersecting[0];
      let bestScore = Infinity;
      for (const item of intersecting) {
        const score = item.rect.top <= probe && item.rect.bottom >= probe
          ? 0
          : Math.min(Math.abs(item.rect.top - probe), Math.abs(item.rect.bottom - probe));
        if (score < bestScore) {
          best = item;
          bestScore = score;
        }
      }
      if (reader.currentIndex !== best.index) {
        const nextIndex = best.index;
        reader.currentIndex = nextIndex;
        reader.pageIndicator = `${nextIndex + 1} / ${total}`;
        reader.sliderValue = nextIndex;
        reader.touchProgress();
        releaseFarWebtoonPages(nextIndex);
      }
    }, { root: scrollRoot.value, rootMargin: '800px 0px', threshold: 0.1 });

    scrollRoot.value.querySelectorAll('img[data-lazy-index]').forEach(img => reader.webtoonObserver.observe(img));
    lastMangaImage = scrollRoot.value.querySelector(`img[data-lazy-index="${total - 1}"]`);
  }

  // 恢复上次阅读位置
  if (reader.currentIndex > 0) {
    setTimeout(() => {
      if (disposed) return;
      if (!isManga.value) measureNovelOffsets();
      scrollToSection(reader.currentIndex, 'auto');
      syncNovelScrollPosition();
      syncScrollBounds();
    }, 50);
  } else {
    if (!isManga.value) scheduleNovelOffsetMeasure();
    syncNovelScrollPosition();
    syncScrollBounds();
  }
});

onBeforeUnmount(() => {
  disposed = true;
  boundsObserver?.disconnect();
  novelContentObserver?.disconnect();
  if (scrollRoot.value) {
    scrollRoot.value.removeEventListener('scroll', onScroll);
    scrollRoot.value.removeEventListener('load', onContentLoad, true);
  }
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  if (novelOffsetFrame) cancelAnimationFrame(novelOffsetFrame);
  novelOffsetFrame = 0;
  novelOffsets = [];
  if (reader.webtoonObserver) {
    reader.webtoonObserver.disconnect();
    reader.webtoonObserver = null;
  }
  reader.webtoonScrollBy = null;
  reader.webtoonScrollTo = null;
});
</script>
