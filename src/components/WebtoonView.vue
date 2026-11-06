<template>
  <!-- Manga: 纵向条漫瀑布流，图片懒加载 -->
  <div
    v-if="isManga"
    ref="scrollRoot"
    data-reader-scroll
    :data-fit="reader.layoutConfig.webtoonFit"
    :class="{ 'desktop-manga-scroll': !isAndroid && !isIOS }"
    class="manga-scroll no-scrollbar w-full h-full overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y flex flex-col items-center py-2 gap-2"
    style="scroll-padding-top: calc(3.5rem + env(safe-area-inset-top)); scroll-padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));"
  >
    <div
      v-for="(p, idx) in reader.activePages"
      :key="idx"
      class="webtoon-page w-full flex flex-col items-center justify-center shrink-0"
      :class="{ 'webtoon-page-sized': p.itemRef?.width && p.itemRef.height }"
      :style="pageSizeStyle(p.itemRef)"
    >
      <div v-if="p.html" class="epub-content webtoon-appendix" v-html="p.html"></div>
      <img v-else :data-lazy-index="idx" class="manga-page-img bg-[var(--bg-card)] shadow-sm rounded-sm" :alt="'第 ' + p.pageNumber + ' 页'" decoding="async" draggable="false" />
    </div>
    <div class="shrink-0" style="height: calc(4.5rem + env(safe-area-inset-bottom));" aria-hidden="true"></div>
  </div>

  <!-- Novel: 长卷连续滚动 -->
  <div
    v-else
    ref="scrollRoot"
    data-reader-scroll
    :data-fit="reader.layoutConfig.webtoonFit"
    class="no-scrollbar w-full h-full overflow-y-auto overscroll-contain touch-pan-y py-4 px-3 sm:px-2"
    style="scroll-padding-top: calc(3.5rem + env(safe-area-inset-top)); scroll-padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));"
  >
    <div :style="{ fontSize: reader.layoutConfig.fontSize + 'px' }" class="novel-scroll-content mx-auto bg-[var(--md-surface-low)] border-[0.5px] border-[var(--md-outline-variant)] rounded-[16px] p-5 sm:p-12 space-y-8">
      <section
        v-for="p in reader.activePages"
        :key="p.pageNumber"
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

import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { ensurePageUrlLoaded } from '../services/pagination.js';
import { isAndroid, isIOS } from '../services/platform.js';

const reader = useReaderStore();
const scrollRoot = ref(null);
let scrollFrame = 0;
let pageNodes = [];
const mountedBookId = reader.currentBook?.id;
let disposed = false;
let boundsObserver = null;

const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

function pageSizeStyle(item) {
  if (!item?.width || !item.height) return undefined;
  const aspectRatio = item.width / item.height;
  return { aspectRatio, '--page-ratio': aspectRatio };
}

function syncScrollPosition() {
  scrollFrame = 0;
  const root = scrollRoot.value;
  if (!root || disposed || reader.currentBook?.id !== mountedBookId || !pageNodes.length) return;

  const atStart = root.scrollTop <= 2;
  const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
  const lastImage = isManga.value ? pageNodes.at(-1).querySelector('img') : null;
  const atEnd = atBottom && (!lastImage || lastImage.hasAttribute('data-settled'));
  if (reader.webtoonBounds.atStart !== atStart || reader.webtoonBounds.atEnd !== atEnd) {
    reader.webtoonBounds = { atStart, atEnd };
  }

  let nextIndex = 0;
  if (!atStart) {
    if (atEnd) nextIndex = pageNodes.length - 1;
    else {
      const probe = root.scrollTop + root.clientHeight * 0.45;
      let low = 0;
      let high = pageNodes.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (pageNodes[mid].offsetTop <= probe) {
          nextIndex = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
    }
  }

  if (nextIndex === reader.currentIndex) return;
  reader.currentIndex = nextIndex;
  reader.pageIndicator = `${nextIndex + 1} / ${reader.activePages.length}`;
  reader.sliderValue = nextIndex;
  reader.touchProgress();
}

function scheduleScrollSync() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScrollPosition);
}

function onImageSettled(event) {
  if (event.target.matches('img[data-lazy-index]')) event.target.setAttribute('data-settled', '');
  scheduleScrollSync();
}

function scrollToPage(index) {
  const root = scrollRoot.value;
  const target = pageNodes[index];
  if (!root || !target) return;
  if (index === 0) {
    root.scrollTop = 0;
  } else if (index === pageNodes.length - 1) {
    root.scrollTop = root.scrollHeight;
  } else {
    // 滑块跳转与滚动定位使用同一条检测线，避免短页落到下一页。
    root.scrollTop = target.offsetTop - root.clientHeight * 0.45 + 1;
  }
}

watch(() => reader.layoutConfig.webtoonFit, async (fit, previousFit, onCleanup) => {
  const root = scrollRoot.value;
  const page = pageNodes[reader.currentIndex];
  if (!root || !page) return;
  const atStart = root.scrollTop <= 2;
  const atEnd = !atStart && root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
  const probe = root.clientHeight * 0.45;
  // 宽度改变会重新排版，按当前页内的相对位置恢复，而不是跳回页首。
  const offset = Math.max(0, Math.min(1, (root.scrollTop + probe - page.offsetTop) / Math.max(1, page.offsetHeight)));
  let stale = false;
  onCleanup(() => { stale = true; });
  await nextTick();
  if (stale || disposed) return;
  if (atStart) root.scrollTop = 0;
  else if (atEnd) root.scrollTop = root.scrollHeight;
  else root.scrollTop = page.offsetTop + offset * page.offsetHeight - root.clientHeight * 0.45;
  scheduleScrollSync();
});

onMounted(() => {
  const root = scrollRoot.value;
  const total = reader.activePages.length;
  const savedIndex = reader.currentIndex;
  pageNodes = Array.from(root.querySelectorAll(isManga.value ? '.webtoon-page' : '.webtoon-chapter'));
  reader.pageIndicator = `${savedIndex + 1} / ${total}`;
  reader.sliderValue = savedIndex;
  root.addEventListener('scroll', scheduleScrollSync, { passive: true });
  root.addEventListener('load', onImageSettled, true);
  root.addEventListener('error', onImageSettled, true);
  boundsObserver = new ResizeObserver(scheduleScrollSync);
  boundsObserver.observe(root);

  // 注册滚动入口：store 的翻页 / 滑条动作在条漫模式下转成滚动
  reader.webtoonScrollBy = dir => {
    const el = scrollRoot.value;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.88, behavior: 'smooth' });
  };
  reader.webtoonScrollTo = scrollToPage;

  if (isManga.value) {
    // 提前加载附近图片，但实际阅读页由滚动位置决定。
    reader.webtoonObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || disposed || reader.currentBook?.id !== mountedBookId) continue;
        const img = entry.target;
        const item = reader.activePages[Number(img.dataset.lazyIndex)]?.itemRef;
        reader.webtoonObserver.unobserve(img);
        ensurePageUrlLoaded(item).then(url => {
          if (disposed || reader.currentBook?.id !== mountedBookId) return;
          if (url) img.src = url;
          else {
            img.setAttribute('data-settled', '');
            scheduleScrollSync();
          }
        }).catch(err => {
          if (disposed || reader.currentBook?.id !== mountedBookId) return;
          console.warn('[HOMURA] 条漫图片加载失败', err);
          img.setAttribute('data-settled', '');
          scheduleScrollSync();
        });
      }
    }, { root, rootMargin: '800px 0px', threshold: 0.1 });

    root.querySelectorAll('img[data-lazy-index]').forEach(img => reader.webtoonObserver.observe(img));
  }

  // 在占位尺寸已经生效后恢复，再根据画布上的实际位置同步进度。
  scrollFrame = requestAnimationFrame(() => {
    if (savedIndex > 0) scrollToPage(savedIndex);
    syncScrollPosition();
  });
});

onBeforeUnmount(() => {
  disposed = true;
  boundsObserver?.disconnect();
  if (scrollRoot.value) {
    scrollRoot.value.removeEventListener('scroll', scheduleScrollSync);
    scrollRoot.value.removeEventListener('load', onImageSettled, true);
    scrollRoot.value.removeEventListener('error', onImageSettled, true);
  }
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  if (reader.webtoonObserver) {
    reader.webtoonObserver.disconnect();
    reader.webtoonObserver = null;
  }
  reader.webtoonScrollBy = null;
  reader.webtoonScrollTo = null;
});
</script>

<style scoped>
[data-reader-scroll] {
  position: relative;
}

.webtoon-page {
  min-width: 0;
  max-width: 100%;
}
.manga-scroll {
  --wide-left-gutter: max(4px, env(safe-area-inset-left, 0px));
  --wide-right-gutter: max(4px, env(safe-area-inset-right, 0px));
  --manga-narrow-width: min(90%, 720px);
}
.manga-scroll[data-fit="wide"] {
  box-sizing: border-box;
  padding-left: var(--wide-left-gutter);
  padding-right: var(--wide-right-gutter);
}
.manga-scroll[data-fit="medium"] .webtoon-page,
.desktop-manga-scroll[data-fit="screen"] .webtoon-page {
  max-width: var(--manga-narrow-width);
}
.desktop-manga-scroll[data-fit="medium"] .webtoon-page {
  --manga-wide-width: calc(100% - var(--wide-left-gutter) - var(--wide-right-gutter));
  max-width: calc((var(--manga-narrow-width) + var(--manga-wide-width)) / 2);
}
.manga-scroll:not(.desktop-manga-scroll)[data-fit="screen"] .webtoon-page-sized {
  max-width: min(100%, calc((100dvh - 6rem) * var(--page-ratio)));
}
.webtoon-page img { display: block; width: 100%; max-width: 100%; height: auto; object-fit: contain; }
.manga-scroll:not(.desktop-manga-scroll)[data-fit="screen"] .webtoon-page:not(.webtoon-page-sized) img {
  width: auto;
  max-width: 100%;
  max-height: calc(100dvh - 6rem);
}
.webtoon-appendix {
  box-sizing: border-box;
  overflow-wrap: anywhere;
  width: min(100%, 720px);
  padding: 16px;
  background: var(--md-surface-container);
  color: var(--md-on-surface);
}

/* 占位防止未加载的页挤成一行，恢复位置与预加载窗口才有稳定的参照。 */
.webtoon-page:not(.webtoon-page-sized) img:not([data-settled]) {
  min-height: min(65dvh, 480px);
}

.webtoon-page-sized {
  position: relative;
}

.webtoon-page-sized img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  max-height: none;
}

.novel-scroll-content {
  --novel-narrow-width: min(100%, 660px);
  max-width: var(--novel-narrow-width);
}
[data-fit="medium"] .novel-scroll-content {
  max-width: calc((var(--novel-narrow-width) + 100%) / 2);
}
[data-fit="wide"] .novel-scroll-content {
  max-width: 100%;
}
</style>
