<template>
  <!-- 继续阅读 · 书封主导的 MD3 特色卡（桌面跨三列 / 手机整行） -->
  <button
    v-if="featured"
    type="button"
    class="continue-card md-featured-cell"
    :title="`${started ? '继续阅读' : '开始阅读'}：${featured.book.title}`"
    :aria-label="`${started ? '继续阅读' : '开始阅读'}：${featured.book.title}`"
    @click="$emit('open', featured.book.id)"
  >
    <!-- 39% 封面：优先真实书封，缺失时使用主题色书封 -->
    <span class="cover-shell">
      <img
        v-if="featured.book.cover"
        :src="featured.book.cover"
        class="cover-image"
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
      />
      <span v-else class="cover-fallback" aria-hidden="true">
        <span class="cover-orbit cover-orbit-a"></span>
        <span class="cover-orbit cover-orbit-b"></span>
        <span class="cover-wordmark">HOMURA</span>
        <span class="cover-fallback-copy">
          <strong class="font-display">{{ featured.book.title }}</strong>
          <small>{{ typeLabel }}</small>
        </span>
      </span>
      <span class="cover-shade" aria-hidden="true"></span>
      <span class="cover-spine" aria-hidden="true"></span>
      <span class="cover-type">{{ typeLabel }}</span>
    </span>

    <span class="content">
      <span class="eyebrow-row">
        <span class="eyebrow">{{ started ? '继续阅读' : '开始阅读' }}</span>
        <span class="last-read">{{ lastReadLabel }}</span>
      </span>

      <span class="book-title">{{ featured.book.title }}</span>

      <span class="meta">
        <span class="position">
          <template v-if="started">第 {{ featured.progress.index + 1 }} / {{ totalPages }} 页</template>
          <template v-else>{{ totalPages }} {{ countUnit }}</template>
        </span>
        <span class="status">{{ remainingText }}</span>
      </span>

      <span class="footer">
        <span class="progress-wrap">
          <span class="progress-label">
            <span>阅读进度</span>
            <b>{{ progressPercent }}%</b>
          </span>
          <span class="progress-track" aria-hidden="true">
            <span class="progress-fill" :style="{ width: progressPercent + '%' }"></span>
          </span>
        </span>
        <span class="play" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>
          </svg>
        </span>
      </span>
    </span>
  </button>
</template>

<script setup>
import { computed } from 'vue';
import { useShelfStore } from '../stores/shelf.js';
import { resolveBookFormat } from '../services/utils.js';

defineEmits(['open']);
const props = defineProps({ books: { type: Array, default: null } });

const shelf = useShelfStore();

const items = computed(() =>
  (props.books || shelf.library)
    .map(book => {
      const record = shelf.progressMap[book.id];
      const progress = shelf.progressInfoFor(book.id) || (record ? { percent: 0, index: record.index || 0, total: record.total || 0, updatedAt: record.updatedAt || 0 } : null);
      return { book, progress };
    })
    .filter(item => item.progress)
    .sort((a, b) => (b.progress.updatedAt || 0) - (a.progress.updatedAt || 0))
);

// 没有阅读记录时，用最近添加的一部作品作为「开始阅读」入口，保证特色卡始终在网格首位
const featured = computed(() => {
  if (items.value.length) return items.value[0];
  const book = (props.books || shelf.library)[0];
  if (!book) return null;
  const total = book.pageCount || (book.pageItems && book.pageItems.length) || (book.chapters && book.chapters.length) || 0;
  return { book, progress: { index: 0, total, percent: 0, updatedAt: 0 } };
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

const started = computed(() => !!featured.value && featured.value.progress.updatedAt > 0);

// 未开始阅读的小说显示章节数，漫画 / PDF 才是页数；读起来之后一律用实际分页。
const countUnit = computed(() => (featured.value?.book?.type === 'manga' ? '页' : '章'));

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

const lastReadLabel = computed(() => {
  if (!started.value) return '初次阅读';
  return clockText.value ? `上次 ${clockText.value}` : '上次阅读';
});

const remainingText = computed(() => {
  const item = featured.value;
  if (!item || !started.value) return '尚未开始';
  const rest = Math.max(0, totalPages.value - item.progress.index - 1);
  return `剩 ${rest} 页`;
});

const progressPercent = computed(() => {
  const percent = featured.value ? Number(featured.value.progress.percent) : 0;
  return Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
});
</script>

<style scoped>
  .continue-card {
    position: relative;
    isolation: isolate;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 158px;
    padding: 0;
    overflow: hidden;
    display: flex;
    gap: 0;
    border: 0;
    border-radius: 12px;
    color: var(--md-on-primary-container);
    text-align: left;
    background: var(--md-primary-container);
    box-shadow: none;
    transition: box-shadow 200ms cubic-bezier(0.2, 0, 0, 1);
  }

  .continue-card::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 6;
    border-radius: inherit;
    background: var(--md-on-primary-container);
    opacity: 0;
    pointer-events: none;
    transition: opacity 200ms cubic-bezier(0.2, 0, 0, 1);
  }

  .continue-card:focus-visible {
    outline: 2px solid var(--md-primary);
    outline-offset: 2px;
  }

  .cover-shell {
    position: relative;
    flex: 0 0 39%;
    align-self: stretch;
    min-height: 156px;
    overflow: hidden;
    border-radius: 12px 0 0 12px;
    color: var(--md-on-primary);
    background:
      radial-gradient(circle at 82% 22%, color-mix(in oklab, var(--md-tertiary) 48%, transparent), transparent 36%),
      linear-gradient(155deg, var(--md-primary), color-mix(in oklab, var(--md-primary) 42%, var(--md-tertiary)));
    box-shadow: inset -1px 0 0 color-mix(in oklab, var(--md-on-primary-container) 16%, transparent);
  }

  .cover-image {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .cover-fallback {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    color: var(--md-on-primary);
  }

  .cover-wordmark {
    position: absolute;
    top: 12px;
    left: 14px;
    z-index: 2;
    font: 750 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .16em;
    opacity: .72;
  }

  .cover-orbit {
    position: absolute;
    display: block;
    border: 1px solid color-mix(in oklab, var(--md-on-primary) 38%, transparent);
    border-radius: 50%;
  }

  .cover-orbit-a {
    width: 82%;
    aspect-ratio: 1;
    right: -24%;
    top: 12%;
  }

  .cover-orbit-b {
    width: 44%;
    aspect-ratio: 1;
    right: 14%;
    top: 24%;
    background: color-mix(in oklab, var(--md-on-primary) 15%, transparent);
  }

  .cover-fallback-copy {
    position: absolute;
    inset: auto 14px 16px;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cover-fallback-copy strong {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    font-size: 18px;
    line-height: 1.24;
    letter-spacing: -.02em;
    text-wrap: balance;
  }

  .cover-fallback-copy small {
    font: 650 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .12em;
    opacity: .72;
  }

  .cover-shade {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(180deg, transparent 54%, color-mix(in oklab, var(--md-primary-container) 58%, transparent)),
      linear-gradient(90deg, color-mix(in oklab, var(--md-on-primary-container) 16%, transparent), transparent 18%);
  }

  .cover-spine {
    position: absolute;
    inset: 0 auto 0 0;
    width: 11px;
    border-radius: 12px 0 0 12px;
    pointer-events: none;
    background: linear-gradient(90deg, color-mix(in oklab, var(--md-on-primary-container) 26%, transparent), transparent);
  }

  .cover-type {
    position: absolute;
    left: 10px;
    bottom: 9px;
    z-index: 2;
    padding: 3px 7px;
    border-radius: 999px;
    color: var(--md-on-surface);
    background: color-mix(in oklab, var(--md-surface) 78%, transparent);
    font-size: 9px;
    font-weight: 700;
  }

  .content {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 16px;
  }

  .eyebrow-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--md-primary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .04em;
  }

  .eyebrow::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 0 4px color-mix(in oklab, currentColor 12%, transparent);
  }

  .last-read {
    margin-left: auto;
    color: color-mix(in oklab, var(--md-on-primary-container) 62%, transparent);
    font: 550 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: nowrap;
  }

  .book-title {
    display: -webkit-box;
    margin: 8px 0 4px;
    overflow: hidden;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.24;
    letter-spacing: -.02em;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
  }

  .meta {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 12px;
    color: color-mix(in oklab, var(--md-on-primary-container) 68%, transparent);
    font-size: 11px;
    font-weight: 520;
  }

  .position {
    white-space: nowrap;
  }

  .status {
    margin-left: auto;
    white-space: nowrap;
  }

  .footer {
    display: flex;
    align-items: end;
    gap: 12px;
    margin-top: 12px;
  }

  .progress-wrap {
    flex: 1;
    min-width: 0;
  }

  .progress-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 7px;
    color: color-mix(in oklab, var(--md-on-primary-container) 60%, transparent);
    font-size: 10px;
    font-weight: 600;
  }

  .progress-label b {
    color: var(--md-on-primary-container);
    font: 650 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .progress-track {
    display: block;
    height: 4px;
    overflow: hidden;
    border-radius: 2px;
    background: color-mix(in oklab, var(--md-on-primary-container) 16%, transparent);
  }

  .progress-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--md-primary);
  }

  .play {
    position: relative;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: var(--md-on-primary);
    background: var(--md-primary);
    transition: background-color 200ms cubic-bezier(0.2, 0, 0, 1);
  }

  .play svg {
    width: 18px;
    height: 18px;
  }

  @media (hover: hover) and (pointer: fine) {
    .continue-card:hover {
      box-shadow:
        0 1px 2px 0 color-mix(in oklab, var(--md-shadow-color) 24%, transparent),
        0 4px 10px -4px color-mix(in oklab, var(--md-shadow-color) 28%, transparent);
    }

    .continue-card:hover::after {
      opacity: 0.06;
    }

    .continue-card:hover .play {
      background: color-mix(in oklab, var(--md-primary) 92%, var(--md-on-primary));
    }
  }

  @media (max-width: 420px) {
    .cover-shell {
      flex-basis: 36%;
    }

    .content {
      padding: 13px 12px 12px 14px;
    }

    .last-read {
      display: none;
    }
  }

  @media (min-width: 900px) {
    .book-title {
      font-size: 22px;
    }
  }

  @media (min-width: 900px) and (max-width: 1179px) {
    .last-read {
      display: none;
    }

    .content {
      padding: 13px 12px 12px 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .continue-card,
    .continue-card::after,
    .play {
      transition: none;
    }
  }
</style>
