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
      <MdIcon name="arrow_back" />
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
        <MdIcon :name="ui.fullscreen ? 'fullscreen_exit' : 'fullscreen'" />
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
        <MdIcon name="toc" />
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
        <MdIcon name="collections_bookmark" />
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
        <MdIcon name="star" :filled="isFavorite" />
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
        <MdIcon name="settings" />
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
import MdIcon from './MdIcon.vue';

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
