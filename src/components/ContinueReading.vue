<template>
  <!-- 继续阅读 · MD3 特色卡（桌面跨两列 / 手机整行），点击回到上次阅读位置 -->
  <button
    v-if="featured"
    type="button"
    @click="$emit('open', featured.book.id)"
    class="md-featured-cell w-full h-full min-h-[96px] min-w-0 text-left rounded-[16px] overflow-hidden flex bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]"
    :title="`继续阅读：${featured.book.title}`"
  >
    <!-- 竖排衬线书封 -->
    <div
      class="relative shrink-0 overflow-hidden"
      :class="compactCard ? 'w-[78px]' : 'w-[150px]'"
      :style="{ background: 'linear-gradient(155deg, var(--md-primary), color-mix(in oklab, var(--md-primary) 42%, var(--md-tertiary)))' }"
    >
      <span
        class="absolute text-[var(--md-on-primary)] overflow-hidden"
        :class="compactCard ? 'left-2.5 bottom-2.5 text-[12px] font-bold max-w-[calc(100%-20px)]' : 'left-4 top-4 font-semibold max-h-[calc(100%-32px)]'"
        :style="coverTitleStyle"
      >{{ coverLabel }}</span>
      <i
        v-if="!compactCard"
        class="absolute inset-3 rounded-[4px] pointer-events-none"
        :style="{ border: '0.5px solid color-mix(in oklab, var(--md-on-primary) 34%, transparent)' }"
      ></i>
    </div>

    <!-- 信息区 -->
    <div class="min-w-0 flex-1 flex flex-col justify-center" :class="compactCard ? 'px-3.5 py-3' : 'p-[18px]'">
      <div class="font-mono uppercase opacity-70 text-[12px]" :class="compactCard ? 'tracking-[0.12em]' : 'tracking-[0.14em]'">{{ started ? 'Continue reading' : 'Start reading' }}</div>
      <h3 class="font-extrabold line-clamp-2" :class="compactCard ? 'text-[13px] mt-1.5 mb-1 leading-snug' : 'text-[17px] mt-[7px] mb-[5px] leading-[1.25]'">{{ featured.book.title }}</h3>
      <p class="opacity-70 flex items-center gap-1.5 min-w-0 overflow-hidden text-[12px]">
        <template v-for="(part, idx) in subtitleParts" :key="idx">
          <i v-if="idx" class="block w-[0.5px] h-2.5 shrink-0 bg-current opacity-25"></i>
          <span :class="idx === subtitleParts.length - 1 ? 'truncate' : 'shrink-0'">{{ part }}</span>
        </template>
      </p>
      <div v-if="!compactCard" class="flex gap-2.5 mt-2 font-mono text-[12px] opacity-60">
        <span>剩余 {{ remainingText }}</span>
        <span>{{ timeText }}</span>
      </div>

      <div class="flex items-center" :class="compactCard ? 'mt-auto gap-2' : 'mt-5 gap-2.5'">
        <div
          class="flex-1 h-[3px] rounded-full overflow-hidden"
          :style="{ background: 'color-mix(in oklab, var(--md-on-primary-container) 18%, transparent)' }"
        >
          <i class="block h-full rounded-full bg-[var(--md-primary)]" :style="{ width: featured.progress.percent + '%' }"></i>
        </div>
        <em class="not-italic font-mono text-[12px]">{{ featured.progress.percent }}%</em>
        <span
          v-if="!compactCard"
          class="w-10 h-10 shrink-0 rounded-full grid place-items-center bg-[var(--md-primary)] text-[var(--md-on-primary)] ml-2.5"
        >
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M7 4l13 8-13 8z"/>
          </svg>
        </span>
      </div>
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue';
import { useShelfStore } from '../stores/shelf.js';
import { useViewport } from '../composables/useViewport.js';
import { resolveBookFormat } from '../services/utils.js';

defineEmits(['open']);

const shelf = useShelfStore();
const { isCompact, width } = useViewport();

// 900–1179 的最小桌面窗口仍只有两列宽，沿用紧凑排版避免标题被挤压。
const compactCard = computed(() => isCompact.value || width.value < 1180);

const items = computed(() =>
  shelf.library
    .map(book => ({ book, progress: shelf.progressInfoFor(book.id) }))
    .filter(item => item.progress)
    .sort((a, b) => (b.progress.updatedAt || 0) - (a.progress.updatedAt || 0))
);

// 没有阅读记录时，用最近添加的一部作品作为「开始阅读」入口，保证特色卡始终在网格首位
const featured = computed(() => {
  if (items.value.length) return items.value[0];
  const book = shelf.library[0];
  if (!book) return null;
  const total = book.pageCount || (book.pageItems && book.pageItems.length) || (book.chapters && book.chapters.length) || 0;
  return { book, progress: { index: 0, total, percent: 0, updatedAt: 0 } };
});

// 封面书名：优先取中文部分，避免竖排把 "Homura" 截成 "Homu"
const coverLabel = computed(() => {
  const raw = featured.value ? featured.value.book.title.trim() : '';
  if (!raw) return '';
  const zh = raw.replace(/[A-Za-z0-9（）()「」《》·:：—\-\s]/g, '');
  const label = zh || raw;
  return compactCard.value ? label.slice(0, 3) : label.slice(0, 12);
});

// 桌面：竖排衬线书名（手机退化为左下角横排小字）
const coverTitleStyle = computed(() => {
  if (compactCard.value) return null;
  const n = coverLabel.value.length;
  return {
    writingMode: 'vertical-rl',
    fontFamily: "'Songti SC', 'Instrument Serif', serif",
    letterSpacing: '0.16em',
    lineHeight: 1.25,
    fontSize: (n <= 6 ? 26 : n <= 9 ? 20 : 15) + 'px'
  };
});

const typeLabel = computed(() => {
  const book = featured.value && featured.value.book;
  if (!book) return '';
  const format = resolveBookFormat(book);
  if (format === 'pdf') return 'PDF';
  if (format === 'mobi') return 'MOBI';
  if (format === 'markdown') return 'MD';
  if (format === 'txt') return 'TXT';
  return book.type === 'manga' ? '漫画' : (book.type === 'epub' ? 'EPUB' : '轻小说');
});

const totalPages = computed(() => {
  const item = featured.value;
  if (!item) return 0;
  if (item.progress.total) return item.progress.total;
  const book = item.book;
  if (book.pageCount) return book.pageCount;
  if (book.pageItems) return book.pageItems.length;
  return book.chapters ? book.chapters.length : 0;
});

const subtitleParts = computed(() => {
  const item = featured.value;
  if (!item) return [];
  const status = started.value
    ? `${clockText.value} 读到 ${item.progress.index + 1} 页`
    : '尚未开始';
  return [typeLabel.value, `${totalPages.value} 页`, status];
});

const started = computed(() => !!featured.value && featured.value.progress.percent > 0);

// 上次阅读时间：当天只显示时刻，跨天显示日期
const clockText = computed(() => {
  const item = featured.value;
  if (!item || !item.progress.updatedAt) return '';
  const date = new Date(item.progress.updatedAt);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
});

const remainingText = computed(() => {
  const item = featured.value;
  if (!item) return '';
  return `${Math.max(0, totalPages.value - item.progress.index - 1)} 页`;
});

// 粗略估算：按每分钟约 2 页的阅读速度
const timeText = computed(() => {
  const item = featured.value;
  if (!item) return '';
  const rest = Math.max(0, totalPages.value - item.progress.index - 1);
  const minutes = Math.max(1, Math.round(rest / 2));
  if (minutes < 60) return `约 ${minutes} 分钟`;
  return `约 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
});
</script>
