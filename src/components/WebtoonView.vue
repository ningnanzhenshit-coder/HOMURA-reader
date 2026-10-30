<template>
  <!-- Manga: 纵向条漫瀑布流，图片懒加载 -->
  <div
    v-if="isManga"
    ref="scrollRoot"
    class="w-full h-full overflow-y-auto overscroll-contain flex flex-col items-center py-2 gap-2"
    style="scroll-padding-top: calc(3.5rem + env(safe-area-inset-top)); scroll-padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));"
  >
    <div
      v-for="(p, idx) in reader.activePages"
      :key="idx"
      :id="'webtoon-page-' + idx"
      class="w-full flex flex-col items-center justify-center shrink-0"
    >
      <img :data-lazy-index="idx" class="manga-page-img bg-[var(--bg-card)] shadow-sm rounded-sm select-none" :class="imgFitClass" :alt="'第 ' + p.pageNumber + ' 页'" />
    </div>
    <div class="shrink-0" style="height: calc(4.5rem + env(safe-area-inset-bottom));" aria-hidden="true"></div>
  </div>

  <!-- Novel: 长卷连续滚动 -->
  <div
    v-else
    ref="scrollRoot"
    class="w-full h-full overflow-y-auto overscroll-contain py-4 px-3 sm:px-2"
    style="scroll-padding-top: calc(3.5rem + env(safe-area-inset-top)); scroll-padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));"
  >
    <div :style="{ fontSize: reader.layoutConfig.fontSize + 'px' }" class="max-w-[660px] mx-auto bg-[var(--md-surface-low)] border-[0.5px] border-[var(--md-outline-variant)] rounded-[16px] p-5 sm:p-12 space-y-8">
      <section
        v-for="p in reader.activePages"
        :key="p.pageNumber"
        :id="'webtoon-page-' + (p.pageNumber - 1)"
        class="border-b-[0.5px] border-[var(--border-line)] pb-6 last:border-none"
      >
        <div class="text-xs font-bold text-[var(--brand-primary)] mb-4 flex items-center gap-2">
          <span class="truncate">{{ p.title }}</span>
          <i class="block w-[0.5px] h-3 shrink-0 bg-current opacity-30"></i>
          <span class="shrink-0">第 {{ p.pageNumber }} 章</span>
        </div>
        <div class="epub-content font-serif leading-relaxed" v-html="p.html"></div>
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
import { ensurePageUrlLoaded } from '../services/pagination.js';

const reader = useReaderStore();
const scrollRoot = ref(null);
let novelScrollFrame = 0;

const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

const imgFitClass = computed(() => {
  const fit = reader.layoutConfig.webtoonFit;
  if (fit === 'screen') return 'max-h-[calc(100dvh-6rem)] w-auto max-w-full object-contain mx-auto';
  if (fit === 'medium') return 'w-full max-w-[720px] h-auto object-contain mx-auto';
  return 'w-full max-w-[1024px] h-auto object-contain mx-auto';
});

function syncNovelScrollPosition() {
  novelScrollFrame = 0;
  const root = scrollRoot.value;
  if (!root || isManga.value) return;

  const sections = Array.from(root.querySelectorAll('section[id^="webtoon-page-"]'));
  if (sections.length === 0) return;

  const rootTop = root.getBoundingClientRect().top;
  const probe = rootTop + root.clientHeight * 0.45;
  let nextIndex = 0;
  sections.forEach((section, idx) => {
    if (section.getBoundingClientRect().top <= probe) nextIndex = idx;
  });
  // 末章较短时可能始终到不了阅读线，滚到底部仍应记到最后一章。
  const canScroll = root.scrollHeight > root.clientHeight + 2;
  if (canScroll && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
    nextIndex = sections.length - 1;
  }

  if (nextIndex === reader.currentIndex) return;
  reader.currentIndex = nextIndex;
  reader.pageIndicator = `${nextIndex + 1} / ${reader.activePages.length}`;
  reader.sliderValue = nextIndex;
  reader.touchProgress();
}

function onNovelScroll() {
  if (novelScrollFrame) return;
  novelScrollFrame = requestAnimationFrame(syncNovelScrollPosition);
}

onMounted(() => {
  const total = reader.activePages.length;
  reader.pageIndicator = `${reader.currentIndex + 1} / ${total}`;
  reader.sliderValue = reader.currentIndex;

  // 注册滚动入口：store 的翻页 / 滑条动作在条漫模式下转成滚动
  reader.webtoonScrollBy = dir => {
    const el = scrollRoot.value;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.88, behavior: 'smooth' });
  };
  reader.webtoonScrollTo = idx => {
    const root = scrollRoot.value;
    if (!root) return;
    const target = root.querySelector('#webtoon-page-' + idx);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (isManga.value) {
    // 当前页前后各预载几页，避免恢复进度时白屏
    for (let i = Math.max(0, reader.currentIndex - 1); i <= Math.min(total - 1, reader.currentIndex + 2); i++) {
      ensurePageUrlLoaded(reader.activePages[i].itemRef).then(url => {
        const el = scrollRoot.value && scrollRoot.value.querySelector(`img[data-lazy-index="${i}"]`);
        if (el && url) el.src = url;
      });
    }

    reader.webtoonObserver = new IntersectionObserver(entries => {
      entries.forEach(async entry => {
        if (entry.isIntersecting) {
          const imgEl = entry.target;
          const idx = parseInt(imgEl.getAttribute('data-lazy-index'), 10);
          const pageData = reader.activePages[idx];
          if (pageData) {
            const url = await ensurePageUrlLoaded(pageData.itemRef);
            if (url && imgEl.src !== url) imgEl.src = url;
          }
          reader.currentIndex = idx;
          reader.pageIndicator = `${idx + 1} / ${total}`;
          reader.sliderValue = idx;
          reader.touchProgress();
        }
      });
    }, { root: scrollRoot.value, rootMargin: '800px 0px', threshold: 0.1 });

    scrollRoot.value.querySelectorAll('img[data-lazy-index]').forEach(img => reader.webtoonObserver.observe(img));
  } else {
    scrollRoot.value.addEventListener('scroll', onNovelScroll, { passive: true });
  }

  // 恢复上次阅读位置
  if (reader.currentIndex > 0) {
    setTimeout(() => {
      const root = scrollRoot.value;
      if (!root) return;
      const target = root.querySelector('#webtoon-page-' + reader.currentIndex);
      if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
      syncNovelScrollPosition();
    }, 50);
  } else {
    syncNovelScrollPosition();
  }
});

onBeforeUnmount(() => {
  if (novelScrollFrame) cancelAnimationFrame(novelScrollFrame);
  novelScrollFrame = 0;
  if (reader.webtoonObserver) {
    reader.webtoonObserver.disconnect();
    reader.webtoonObserver = null;
  }
  if (scrollRoot.value) scrollRoot.value.removeEventListener('scroll', onNovelScroll);
  reader.webtoonScrollBy = null;
  reader.webtoonScrollTo = null;
});
</script>
