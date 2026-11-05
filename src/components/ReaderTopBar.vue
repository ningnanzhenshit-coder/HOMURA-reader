<template>
  <!-- 阅读器顶部栏：浮在画布上的 M3 small top app bar -->
  <header class="md-reader-topbar" aria-label="阅读器工具栏">
    <button
      type="button"
      @click="emit('back')"
      class="md-icon-button"
      title="返回书架 (Esc)"
      aria-label="返回书架"
    >
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>

    <div class="min-w-0 flex-1 px-1">
      <h2
        class="truncate text-[21px] font-semibold leading-[1.2] tracking-[-0.015em] text-[var(--md-on-surface)] min-[900px]:text-[22px]"
        :title="reader.currentBook ? reader.currentBook.title : ''"
      >{{ reader.currentBook ? reader.currentBook.title : '' }}</h2>
      <p class="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden font-mono text-[10.5px] leading-4 text-[var(--md-on-surface-variant)]">
        <template v-for="(part, idx) in subStatusParts" :key="idx">
          <span v-if="idx" class="shrink-0" aria-hidden="true">·</span>
          <span :class="idx === subStatusParts.length - 1 ? 'shrink-0 font-medium text-[var(--md-on-surface)]' : 'truncate'">{{ part }}</span>
        </template>
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-0.5">
      <!-- 全屏切换：默认仅 Windows 桌面显示，移动端窗口本身即全屏，不占位 -->
      <button
        v-if="settings.showFullscreenButton"
        type="button"
        @click="ui.toggleFullscreen()"
        class="md-icon-button is-desktop-only"
        :title="ui.fullscreen ? '退出全屏 (F)' : '全屏 (F)'"
        :aria-label="ui.fullscreen ? '退出全屏 (F)' : '全屏 (F)'"
        :aria-pressed="ui.fullscreen"
      >
        <svg v-if="ui.fullscreen" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 4v5H4"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4v5h5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 20v-5h5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20v-5H4"/>
        </svg>
        <svg v-else fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 9V4h5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h5v5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 15v5h-5"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20H4v-5"/>
        </svg>
      </button>
      <button
        type="button"
        @click="ui.openToc()"
        class="md-icon-button"
        title="目录"
        aria-label="目录"
        aria-controls="reader-toc-drawer"
        :aria-expanded="ui.tocOpen"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10"/>
        </svg>
      </button>
      <button
        v-if="reader.currentCollection"
        type="button"
        class="md-icon-button"
        title="本目录"
        aria-label="本目录"
        aria-controls="reader-collection-drawer"
        :aria-expanded="ui.collectionTocOpen"
        @click="ui.openCollectionToc()"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="4" height="14" rx="1.2" stroke-width="1.8"/>
          <rect x="10" y="4" width="4" height="15" rx="1.2" stroke-width="1.8"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16.4 5.4l3.4.9-3 12.8-3.4-.9z"/>
        </svg>
      </button>
      <button
        type="button"
        class="md-icon-button"
        :class="{ 'is-favorite': isFavorite }"
        :title="isFavorite ? '取消收藏' : '收藏本书'"
        :aria-label="isFavorite ? '取消收藏' : '收藏本书'"
        :aria-pressed="isFavorite"
        :disabled="favoriteBusy"
        @click="toggleFavorite"
      >
        <svg :fill="isFavorite ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3l2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3z" />
        </svg>
      </button>
      <button
        type="button"
        @click="ui.openSettings()"
        class="md-icon-button"
        title="阅读设置"
        aria-label="阅读设置"
        aria-controls="reader-settings-drawer"
        :aria-expanded="ui.settingsOpen"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" stroke-width="2"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
    </div>
    <Transition
      enter-active-class="md-fade-enter-active"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="md-fade-leave-active"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <p v-if="favoriteError" role="alert" class="md-reader-alert">{{ favoriteError }}</p>
    </Transition>
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
