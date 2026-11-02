<template>
  <!-- 阅读器顶部栏：MD3 Top App Bar（返回 / 书名+副标题 / 目录 / 设置） -->
  <header
    class="shrink-0 min-h-14 min-[900px]:min-h-16 flex items-center gap-2 px-1.5 min-[900px]:gap-2.5 min-[900px]:px-[18px] bg-[var(--md-surface)] border-b-[0.5px] border-[var(--md-outline-variant)]"
    :style="{ paddingTop: 'env(safe-area-inset-top)' }"
  >
    <button
      @click="emit('back')"
      class="w-11 h-11 shrink-0 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
      title="返回书架 (Esc)"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>

    <div class="min-w-0 flex-1">
      <h2 class="text-[13px] min-[900px]:text-sm font-semibold truncate leading-tight">{{ reader.currentBook ? reader.currentBook.title : '' }}</h2>
      <p class="font-mono text-[12px] min-[900px]:text-[12px] text-[var(--md-primary)] flex items-center gap-1.5 min-w-0 overflow-hidden">
        <template v-for="(part, idx) in subStatusParts" :key="idx">
          <i v-if="idx" class="block w-[0.5px] h-2.5 shrink-0 bg-current opacity-30"></i>
          <span :class="idx === subStatusParts.length - 1 ? 'shrink-0' : 'truncate'">{{ part }}</span>
        </template>
      </p>
    </div>

    <div class="flex items-center gap-1 shrink-0">
      <!-- 全屏切换：默认仅 Windows 桌面显示，移动端窗口本身即全屏，不占位 -->
      <button
        v-if="settings.showFullscreenButton"
        @click="ui.toggleFullscreen()"
        class="hidden min-[900px]:grid w-11 h-11 rounded-full place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
        :title="ui.fullscreen ? '退出全屏 (F)' : '全屏 (F)'"
        :aria-label="ui.fullscreen ? '退出全屏 (F)' : '全屏 (F)'"
        :aria-pressed="ui.fullscreen"
      >
        <svg v-if="ui.fullscreen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 4v5H4"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4v5h5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 20v-5h5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20v-5H4"/>
        </svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 9V4h5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h5v5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 15v5h-5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20H4v-5"/>
        </svg>
      </button>
      <button
        @click="ui.openToc()"
        class="w-11 h-11 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
        title="目录"
        aria-label="目录"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10"/>
        </svg>
      </button>
      <button v-if="reader.currentCollection" class="min-w-11 h-11 px-2 rounded-full text-[11px] font-semibold text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)]" title="本目录" aria-label="本目录" :aria-expanded="ui.collectionTocOpen" @click="ui.openCollectionToc()">本目录</button>
      <button
        class="w-11 h-11 rounded-full grid place-items-center hover:bg-[var(--md-surface-container)] transition-colors duration-200 disabled:opacity-50"
        :title="isFavorite ? '取消收藏' : '收藏本书'"
        :aria-label="isFavorite ? '取消收藏' : '收藏本书'"
        :aria-pressed="isFavorite"
        :disabled="favoriteBusy"
        @click="toggleFavorite"
      >
        <svg class="w-5 h-5" :fill="isFavorite ? 'var(--md-favorite)' : 'var(--md-surface)'" stroke="var(--md-on-surface)" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3l2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3z" />
        </svg>
      </button>
      <button
        @click="ui.openSettings()"
        class="w-11 h-11 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
        title="阅读设置"
        aria-label="阅读设置"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" stroke-width="2"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
    </div>
    <p v-if="favoriteError" role="alert" class="absolute top-full right-4 mt-2 max-w-[280px] p-3 rounded-xl text-[13px] bg-[var(--md-surface-container)] text-[var(--md-on-surface)] shadow-lg">{{ favoriteError }}</p>
  </header>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useShelfStore } from '../stores/shelf.js';
import { useSettingsStore } from '../stores/settings.js';
import { useUiStore } from '../stores/ui.js';

const reader = useReaderStore();
const shelf = useShelfStore();
const settings = useSettingsStore();
const favoriteBusy = ref(false);
const favoriteError = ref('');
const isFavorite = computed(() => !!shelf.library.find(book => book.id === reader.currentBook?.id)?.favorite);
watch(() => reader.currentBook?.id, () => { favoriteError.value = ''; });

async function toggleFavorite() {
  const id = reader.currentBook?.id;
  if (!id || favoriteBusy.value) return;
  favoriteBusy.value = true;
  favoriteError.value = '';
  try {
    await shelf.toggleFavorite(id);
  } catch (err) {
    if (reader.currentBook?.id === id) favoriteError.value = err.message || '收藏保存失败，请重试';
    console.warn('[HOMURA] 收藏保存失败', err);
  } finally {
    favoriteBusy.value = false;
  }
}
const ui = useUiStore();
const emit = defineEmits(['back']);

const subStatusParts = computed(() => {
  const total = reader.activePages.length;
  const pos = `${reader.currentIndex + 1} / ${total}`;
  if (reader.layoutConfig.direction === 'vertical') return ['条漫模式', pos];
  if (reader.layoutConfig.direction === 'rtl') return ['从右到左', pos];
  return ['从左到右', reader.effectiveDouble ? '双页' : '单页', pos];
});
</script>
