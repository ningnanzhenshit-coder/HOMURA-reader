<template>
  <!-- 继续阅读 · 书封主导的 MD3 特色卡（桌面跨三列 / 手机整行） -->
  <button
    type="button"
    class="md-card md-card--featured continue-card"
    :title="`继续阅读：${book.title}`"
    :aria-label="`继续阅读：${book.title}`"
    @click="$emit('open', book.id)"
  >
    <!-- 39% 封面：优先真实书封，缺失时使用主题色书封 -->
    <span class="cover-shell">
      <img
        v-if="book.cover"
        :src="book.cover"
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
          <strong class="font-display">{{ book.title }}</strong>
          <small>{{ typeLabel }}</small>
        </span>
      </span>
      <span class="cover-shade" aria-hidden="true"></span>
      <span class="cover-spine" aria-hidden="true"></span>
      <span class="cover-type">{{ typeLabel }}</span>
    </span>

    <span class="content">
      <span class="eyebrow-row">
        <span class="eyebrow">继续阅读</span>
        <span class="last-read">{{ lastReadLabel }}</span>
      </span>

      <span class="book-title">{{ book.title }}</span>

      <span class="meta">
        <span class="position">第 {{ index + 1 }} / {{ totalPages }} 页</span>
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
          <MdIcon name="play_arrow" filled />
        </span>
      </span>
    </span>
  </button>
</template>

<script setup>
import { computed } from 'vue';
import { resolveBookFormat } from '../services/utils.js';
import MdIcon from './MdIcon.vue';

defineEmits(['open']);
const props = defineProps({
  book: { type: Object, required: true },
  record: { type: Object, required: true }
});

const typeLabel = computed(() => {
  const { book } = props;
  const format = resolveBookFormat(book);
  if (format === 'pdf') return 'PDF';
  if (format === 'mobi') return 'MOBI';
  if (format === 'markdown') return 'MD';
  if (format === 'txt') return 'TXT';
  return book.type === 'manga' ? '漫画' : (book.type === 'epub' ? 'EPUB' : '轻小说');
});

const totalPages = computed(() => props.record.total || props.book.pageCount || props.book.pageItems?.length || props.book.chapters?.length || 1);
const index = computed(() => Math.min(totalPages.value - 1, Math.max(0, props.record.index || 0)));

// 上次阅读时间：当天只显示时刻，跨天显示日期
const lastReadLabel = computed(() => {
  const date = new Date(props.record.updatedAt);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `上次 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }
  return `上次 ${date.getMonth() + 1}/${date.getDate()}`;
});
const remainingText = computed(() => `剩 ${totalPages.value - index.value - 1} 页`);
const progressPercent = computed(() => Math.round(index.value / Math.max(1, totalPages.value - 1) * 100));
</script>

<style scoped>
  .continue-card {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 158px;
    padding: 0;
    overflow: hidden;
    display: flex;
    gap: 0;
    border: 0;
    text-align: left;
  }

  @media (min-width: 768px) {
    .continue-card {
      /* 筛选后首行只有继续阅读时，也保留一张普通书卡的高度。 */
      --book-column-width: calc((100cqi - (var(--featured-span) - 1) * var(--shelf-gap)) / var(--featured-span));
      min-height: max(158px, calc(var(--book-column-width) / (var(--shelf-cover-ratio)) + 48px));
    }
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
    position: absolute;
    inset: 0;
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
    padding-inline-end: 28px;
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
    margin-bottom: 8px;
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
    .continue-card:hover .play {
      background: color-mix(in oklab, var(--md-primary) 92%, var(--md-on-primary));
    }
  }

  @media (max-width: 420px) {
    .cover-shell {
      flex-basis: 36%;
    }

    .content {
      padding: 12px;
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
      padding: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .play {
      transition: none;
    }
  }
</style>
