<template>
  <!-- Manga: 纵向条漫瀑布流，图片懒加载 -->
  <div v-if="isManga" ref="scrollRoot" class="w-full h-full overflow-y-auto flex flex-col items-center py-2 gap-2">
    <div
      v-for="(p, idx) in reader.activePages"
      :key="idx"
      :id="'webtoon-page-' + idx"
      class="w-full flex flex-col items-center justify-center shrink-0"
    >
      <img :data-lazy-index="idx" class="manga-page-img bg-[var(--bg-card)] shadow-sm rounded-sm select-none" :class="imgFitClass" :alt="'第 ' + p.pageNumber + ' 页'" />
    </div>
  </div>

  <!-- Novel: 长卷连续滚动 -->
  <div v-else ref="scrollRoot" class="w-full h-full overflow-y-auto py-4 px-2">
    <div :style="{ fontSize: reader.layoutConfig.fontSize + 'px' }" class="max-w-3xl mx-auto bg-[var(--bg-card)] rounded-xl shadow-sm border border-[var(--border-line)] p-6 sm:p-12 space-y-8">
      <section
        v-for="p in reader.activePages"
        :key="p.pageNumber"
        :id="'webtoon-page-' + (p.pageNumber - 1)"
        class="border-b border-[var(--border-line)] pb-6 last:border-none"
      >
        <div class="text-xs font-bold text-[var(--brand-primary)] mb-4">{{ p.title }} · 第 {{ p.pageNumber }} 章</div>
        <div class="epub-content font-serif leading-relaxed" v-html="p.html"></div>
      </section>
    </div>
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

const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

const imgFitClass = computed(() => {
  const fit = reader.layoutConfig.webtoonFit;
  if (fit === 'screen') return 'max-h-[calc(100vh-6rem)] w-auto max-w-full object-contain mx-auto';
  if (fit === 'medium') return 'w-full max-w-[720px] h-auto object-contain mx-auto';
  return 'w-full max-w-[1024px] h-auto object-contain mx-auto';
});

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
  }

  // 恢复上次阅读位置
  if (reader.currentIndex > 0) {
    setTimeout(() => {
      const root = scrollRoot.value;
      if (!root) return;
      const target = root.querySelector('#webtoon-page-' + reader.currentIndex);
      if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }, 50);
  }
});

onBeforeUnmount(() => {
  if (reader.webtoonObserver) {
    reader.webtoonObserver.disconnect();
    reader.webtoonObserver = null;
  }
  reader.webtoonScrollBy = null;
  reader.webtoonScrollTo = null;
});
</script>
