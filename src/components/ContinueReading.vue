<template>
  <!-- 继续阅读 · 书封主导的 MD3 特色卡（桌面跨两列 / 手机整行） -->
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
        <span class="kind">{{ typeLabel }}</span>
        <span class="position">
          <template v-if="started">第 {{ featured.progress.index + 1 }} / {{ totalPages }} 页</template>
          <template v-else>{{ totalPages }} 页</template>
        </span>
        <span class="status">{{ remainingText }}</span>
      </span>

      <span class="footer">
        <span class="progress-wrap">
          <span class="progress-label">
            <span>阅读进度</span>
            <b>{{ featured.progress.percent }}%</b>
          </span>
          <span
            class="page-meter"
            aria-hidden="true"
            :style="{ gridTemplateColumns: `repeat(${progressSegments.length}, minmax(0, 1fr))` }"
          >
            <i
              v-for="(filled, idx) in progressSegments"
              :key="idx"
              :class="{ done: filled }"
            ></i>
          </span>
        </span>
        <span class="play" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M7 4l13 8-13 8z" stroke-width="2.3" stroke-linejoin="round"/>
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

const shelf = useShelfStore();

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

// 分段数量保持稳定，避免短篇只有两三段时进度条显得零碎
const progressSegments = computed(() => {
  const count = Math.min(10, Math.max(6, totalPages.value || 6));
  const percent = featured.value ? featured.value.progress.percent : 0;
  const rawFilled = Math.round((percent / 100) * count);
  const filled = Math.min(count, Math.max(percent > 0 ? 1 : 0, rawFilled));
  return Array.from({ length: count }, (_, idx) => idx < filled);
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
    border: .5px solid color-mix(in oklab, var(--md-primary) 22%, var(--md-outline-variant));
    border-radius: 20px;
    color: var(--md-on-primary-container);
    text-align: left;
    background:
      radial-gradient(circle at 100% 10%, color-mix(in oklab, var(--md-primary) 14%, transparent), transparent 38%),
      linear-gradient(116deg,
        color-mix(in oklab, var(--md-primary-container) 92%, var(--md-surface-container)),
        color-mix(in oklab, var(--md-primary-container) 44%, var(--md-surface-container)) 62%,
        var(--md-surface-container));
    box-shadow:
      0 1px 0 color-mix(in oklab, var(--md-primary) 13%, transparent) inset,
      0 14px 30px -26px color-mix(in oklab, var(--md-primary) 50%, transparent);
  }

  .continue-card::after {
    content: "";
    position: absolute;
    z-index: -1;
    width: 122px;
    height: 122px;
    right: -50px;
    bottom: -65px;
    border: 1px solid color-mix(in oklab, var(--md-primary) 13%, transparent);
    border-radius: 50%;
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
    border-radius: 19px 0 0 19px;
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
      linear-gradient(180deg, transparent 54%, color-mix(in oklab, var(--md-surface) 58%, transparent)),
      linear-gradient(90deg, color-mix(in oklab, var(--md-on-primary-container) 16%, transparent), transparent 18%);
  }

  .cover-spine {
    position: absolute;
    inset: 0 auto 0 0;
    width: 11px;
    border-radius: 19px 0 0 19px;
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
    backdrop-filter: blur(8px);
  }

  .content {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 14px 14px 13px 16px;
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
    display: block;
    margin: 8px 0 4px;
    overflow: hidden;
    font-size: 18px;
    font-weight: 760;
    line-height: 1.24;
    letter-spacing: -.018em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: color-mix(in oklab, var(--md-on-primary-container) 68%, transparent);
    font-size: 11px;
    font-weight: 520;
  }

  .kind {
    padding: 3px 7px;
    border-radius: 999px;
    color: color-mix(in oklab, var(--md-on-primary-container) 84%, transparent);
    background: color-mix(in oklab, var(--md-on-primary-container) 9%, transparent);
    font-size: 9.5px;
    font-weight: 680;
  }

  .position {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .status {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .footer {
    display: flex;
    align-items: end;
    gap: 12px;
    margin-top: 14px;
  }

  .progress-wrap {
    flex: 1;
    min-width: 0;
  }

  .progress-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 6px;
    color: color-mix(in oklab, var(--md-on-primary-container) 60%, transparent);
    font-size: 9.5px;
    font-weight: 600;
  }

  .progress-label b {
    color: var(--md-on-primary-container);
    font: 650 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .page-meter {
    display: grid;
    gap: 5px;
  }

  .page-meter i {
    height: 4px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--md-on-primary-container) 14%, transparent);
  }

  .page-meter i.done {
    background: var(--md-primary);
  }

  .play {
    position: relative;
    width: 39px;
    height: 39px;
    flex: 0 0 39px;
    display: grid;
    place-items: center;
    border: .5px solid color-mix(in oklab, var(--md-primary) 44%, transparent);
    border-radius: 50%;
    color: var(--md-primary);
    background: color-mix(in oklab, var(--md-primary) 12%, transparent);
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--md-primary) 5%, transparent);
    transition: transform 200ms cubic-bezier(.2, 0, 0, 1), background-color 200ms cubic-bezier(.2, 0, 0, 1);
  }

  .play svg {
    width: 17px;
    height: 17px;
  }

  @media (hover: hover) {
    .continue-card:hover .play {
      transform: translateX(1px) scale(1.04);
      background: color-mix(in oklab, var(--md-primary) 18%, transparent);
    }
  }

  @media (max-width: 420px) {
    .cover-shell {
      flex-basis: 36%;
    }

    .content {
      padding: 13px 12px 12px 14px;
    }

    .book-title {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-size: 17px;
      white-space: normal;
    }

    .last-read {
      display: none;
    }
  }

  @media (min-width: 900px) and (max-width: 1179px) {
    .book-title {
      font-size: 16px;
    }

    .last-read {
      display: none;
    }

    .content {
      padding: 13px 12px 12px 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .play {
      transition: none;
    }

    .continue-card:hover .play {
      transform: none;
    }
  }
</style>
