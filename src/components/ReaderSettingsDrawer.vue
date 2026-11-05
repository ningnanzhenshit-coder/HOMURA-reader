<template>
  <!-- 阅读设置：桌面右侧 Side Sheet（372px）/ 手机 Bottom Sheet（最大 78dvh） -->
  <Transition
    enter-active-class="md-fade-enter-active"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="md-fade-leave-active"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="ui.settingsOpen" class="absolute inset-0 z-40 md-scrim" @click="ui.closeSettings()"></div>
  </Transition>

  <Transition
    enter-active-class="md-sheet-enter-active"
    :enter-from-class="isCompact ? 'translate-y-full' : 'translate-x-full'"
    :enter-to-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
    leave-active-class="md-sheet-leave-active"
    :leave-from-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
    :leave-to-class="isCompact ? 'translate-y-full' : 'translate-x-full'"
  >
    <aside
      v-if="ui.settingsOpen"
      ref="settingsSheetRef"
      id="reader-settings-drawer"
      class="md-drawer"
      aria-labelledby="reader-settings-title"
    >
      <ReaderDrawerHeader
        :is-compact="isCompact"
        title="阅读设置"
        subtitle="排版、外观与自定义封面"
        title-id="reader-settings-title"
        close-label="关闭阅读设置"
        @close="ui.closeSettings()"
        @drag-start="onSheetDragStart"
        @drag-move="onSheetDragMove"
        @drag-end="onSheetDragEnd"
        @drag-cancel="onSheetDragCancel"
      />

      <div
        ref="scrollRef"
        class="md-drawer-body reader-settings-scroll px-5 min-[900px]:px-6"
        :class="{ 'has-overflow': hasOverflow }"
        :style="{ overflowY: hasOverflow ? 'auto' : 'hidden' }"
      >
        <div ref="contentRef" class="pb-2">
        <!-- 阅读方向 -->
        <section class="md-drawer-section">
          <div class="md-drawer-group-head">
            <span class="md-drawer-group-label">阅读方向</span>
            <b class="md-drawer-group-value">{{ directionLabel }}</b>
          </div>
          <MdSegmentedControl
            class="w-full"
            :model-value="config.direction"
            :options="directions"
            aria-label="阅读方向"
            @update:model-value="reader.setDirection"
          />

          <MdSwitch
            v-if="config.direction === 'rtl'"
            class="mt-3.5"
            :model-value="config.rtlInvertButtons"
            title="反转 RTL 模式下左右翻页按钮的方向"
            @update:model-value="reader.toggleRtlTapInvert()"
          >
            <span class="text-[13px] font-medium">左右翻页按钮反转</span>
          </MdSwitch>
        </section>

        <!-- 翻页布局 -->
        <section v-if="!isVertical || isManga" class="md-drawer-section">
          <div class="md-drawer-group-head">
            <span class="md-drawer-group-label">{{ isVertical ? '条漫尺寸' : '翻页布局' }}</span>
            <b class="md-drawer-group-value">{{ spreadLabel }}</b>
          </div>
          <MdSegmentedControl
            v-if="!isVertical && !isPhone"
            class="w-full"
            :model-value="config.spread"
            :options="spreadOptions"
            aria-label="翻页布局"
            @update:model-value="value => reader.setSpreadCount(Number(value))"
          />

          <p v-if="!isVertical && isPhone" class="mt-3 text-[13px] leading-relaxed text-[var(--md-on-surface-variant)]">
            当前屏幕按单页显示，窗口变宽后可选择双页。
          </p>

          <MdSwitch
            v-if="!isVertical && !isPhone && config.spread === 2"
            class="mt-3.5"
            :model-value="config.coverOffset"
            title="双页模式下首页单独显示，确保后续跨页大图对齐"
            @update:model-value="reader.toggleCoverOffset()"
          >
            <span class="text-[13px] font-medium">首页单排</span>
          </MdSwitch>

          <MdSegmentedControl
            v-if="isVertical && isManga"
            class="w-full mt-3.5"
            :model-value="config.webtoonFit"
            :options="webtoonFits"
            aria-label="条漫尺寸"
            @update:model-value="reader.setWebtoonFit"
          />
        </section>

        <!-- 排版 -->
        <section v-if="!isManga" class="md-drawer-section">
          <div class="md-drawer-group-head">
            <span class="md-drawer-group-label">字号</span>
            <b class="md-drawer-group-value">{{ config.fontSize }} px</b>
          </div>
          <div class="grid grid-cols-[48px_minmax(0,1fr)_48px] items-center gap-3">
            <button
              type="button"
              @click="reader.changeFontSize(-1)"
              :disabled="config.fontSize <= NOVEL_FONT_MIN"
              class="md-icon-button is-outlined"
              title="减小字号"
              aria-label="减小字号"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-width="2.4" d="M6 12h12"/></svg>
            </button>
            <input class="reader-font-number" type="number" :min="NOVEL_FONT_MIN" :max="NOVEL_FONT_MAX" step="1" :value="config.fontSize" aria-label="小说字号数值" @change="onFontNumberChange" />
            <button
              type="button"
              @click="reader.changeFontSize(1)"
              :disabled="config.fontSize >= NOVEL_FONT_MAX"
              class="md-icon-button is-outlined"
              title="增大字号"
              aria-label="增大字号"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-width="2.4" d="M12 6v12M6 12h12"/></svg>
            </button>
          </div>
          <input type="range" class="md-range mt-3 w-full" :min="NOVEL_FONT_MIN" :max="NOVEL_FONT_MAX" step="1" :value="config.fontSize" aria-label="小说字号滑块" @input="reader.setFontSize($event.target.value)" />
          <p class="mt-2 text-[11px] leading-relaxed text-[var(--md-on-surface-variant)]">{{ NOVEL_FONT_MIN }}–{{ NOVEL_FONT_MAX }} px · 每页行数随字号和窗口自动调整，按书记忆。</p>
        </section>

        <!-- 外观 -->
        <section class="md-drawer-section">
          <div class="md-drawer-group-head">
            <span class="md-drawer-group-label">阅读模式</span>
            <b class="md-drawer-group-value">{{ modeLabel }}</b>
          </div>
          <SurfaceModePreview />

          <div class="md-drawer-group-head mt-4">
            <span class="md-drawer-group-label">主题色</span>
            <b class="md-drawer-group-value">{{ themeLabel }}</b>
          </div>
          <ThemeSwatchGrid />

          <div class="md-drawer-group-head mt-4">
            <span class="md-drawer-group-label">翻页过渡</span>
            <b class="md-drawer-group-value">{{ TRANSITION_LABELS[theme.transitionStyle] }}</b>
          </div>
          <MdSegmentedControl
            class="w-full"
            :model-value="theme.transitionStyle"
            :options="transitionOptions"
            aria-label="翻页过渡"
            @update:model-value="theme.setTransitionStyle"
          />
        </section>
        <section class="md-drawer-section">
          <h3 class="md-drawer-group-label mb-3">自定义封面</h3>
          <div class="flex items-center gap-3">
            <div class="reader-cover-preview">
              <img v-if="currentCover" :src="currentCover" alt="当前书本封面" />
              <span v-else class="text-[11px] text-center px-1">暂无封面</span>
            </div>
            <div class="flex-1 min-w-0">
              <input ref="coverInput" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp" class="hidden" aria-label="选择自定义封面图片" @change="onCoverSelected" />
              <button type="button" class="md-tonal-button w-full" :disabled="coverBusy" @click="coverInput?.click()">{{ coverBusy ? '正在保存…' : '选择封面图片' }}</button>
              <button v-if="hasCustomCover" type="button" class="md-text-button w-full mt-1" :disabled="coverBusy" @click="saveCover(null)">恢复原封面</button>
              <p class="mt-2 text-[11px] leading-relaxed text-[var(--md-on-surface-variant)]">图片仅保存在本机，不修改原书文件。</p>
            </div>
          </div>
          <p v-if="reader.currentBook?.id.startsWith('demo_')" class="mt-2 text-[11px] text-[var(--md-on-surface-variant)]">示例书封面仅在本次打开期间保留。</p>
          <p v-if="coverError" role="alert" class="mt-2 text-[13px] text-[var(--md-error)]">{{ coverError }}</p>
        </section>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="md-drawer-actions">
        <button
          type="button"
          @click="resetDefaults"
          class="md-text-button"
        >恢复默认</button>
        <button
          type="button"
          @click="ui.closeSettings()"
          class="md-filled-button"
        >完成</button>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed, ref, shallowRef, watch, nextTick } from 'vue';
import { useReaderStore, WEBTOON_FIT_LABELS, NOVEL_FONT_MIN, NOVEL_FONT_MAX } from '../stores/reader.js';
import { useShelfStore } from '../stores/shelf.js';
import {
  SURFACE_MODE_OPTIONS,
  THEME_OPTIONS,
  TRANSITION_LABELS,
  TRANSITION_OPTIONS,
  useThemeStore
} from '../stores/theme.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';
import { useSheetDrag } from '../composables/useSheetDrag.js';
import ReaderDrawerHeader from './ReaderDrawerHeader.vue';
import MdSegmentedControl from './MdSegmentedControl.vue';
import MdSwitch from './MdSwitch.vue';
import SurfaceModePreview from './SurfaceModePreview.vue';
import ThemeSwatchGrid from './ThemeSwatchGrid.vue';

const reader = useReaderStore();
const shelf = useShelfStore();
const scrollRef = shallowRef(null);
const contentRef = shallowRef(null);
const coverInput = shallowRef(null);
const hasOverflow = ref(false);
const coverBusy = ref(false);
const coverError = ref('');
const coverBook = computed(() => shelf.library.find(book => book.id === reader.currentBook?.id));
const currentCover = computed(() => coverBook.value?.cover || null);
const hasCustomCover = computed(() => !!coverBook.value?.customCoverBlob);
watch(() => reader.currentBook?.id, () => { coverError.value = ''; });
watch([scrollRef, contentRef], ([scroll, content], previous, onCleanup) => {
  if (!scroll || !content) return;
  const update = () => { hasOverflow.value = scroll.scrollHeight > scroll.clientHeight + 1; };
  const observer = new ResizeObserver(update);
  observer.observe(scroll);
  observer.observe(content);
  nextTick(update);
  onCleanup(() => observer.disconnect());
}, { flush: 'post' });

function onFontNumberChange(event) {
  if (event.target.value !== '') reader.setFontSize(event.target.value);
  event.target.value = config.fontSize;
}

async function saveCover(file) {
  if (coverBusy.value) return;
  coverError.value = '';
  coverBusy.value = true;
  try {
    await reader.setCustomCover(file);
  } catch (err) {
    coverError.value = err.message || '封面保存失败，请重试';
  } finally {
    coverBusy.value = false;
  }
}

function onCoverSelected(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) saveCover(file);
}
const theme = useThemeStore();
const ui = useUiStore();
const { isPhone, isCompact } = useViewport();
const config = reader.layoutConfig;
const settingsOpen = computed(() => ui.settingsOpen);
const {
  sheetRef: settingsSheetRef,
  onDragStart: onSheetDragStart,
  onDragMove: onSheetDragMove,
  onDragEnd: onSheetDragEnd,
  onDragCancel: onSheetDragCancel
} = useSheetDrag({
  isCompact,
  isOpen: settingsOpen,
  onClose: () => ui.closeSettings()
});

const isVertical = computed(() => config.direction === 'vertical');
const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

const directions = [
  { value: 'ltr', label: '从左到右', title: '普通排版' },
  { value: 'rtl', label: '从右到左', title: '日漫' },
  { value: 'vertical', label: '条漫模式', title: '条漫长卷' }
];

const transitionOptions = TRANSITION_OPTIONS;

const spreadOptions = [
  { value: 1, label: '单页' },
  { value: 2, label: '双页' }
];

const webtoonFits = [
  { value: 'screen', label: WEBTOON_FIT_LABELS.screen },
  { value: 'medium', label: WEBTOON_FIT_LABELS.medium },
  { value: 'wide', label: WEBTOON_FIT_LABELS.wide }
];

const directionLabel = computed(() => (directions.find(d => d.value === config.direction) || directions[0]).label);
const spreadLabel = computed(() => (isVertical.value ? '长卷' : (!isPhone.value && config.spread === 2 ? '双页' : '单页')));
const modeLabel = computed(() => (SURFACE_MODE_OPTIONS.find(option => option.value === theme.surfaceMode) || SURFACE_MODE_OPTIONS[0]).label);
const themeLabel = computed(() => (THEME_OPTIONS.find(option => option.name === theme.themeColor) || THEME_OPTIONS[0]).title.replace(' (默认)', ''));

// 恢复默认：全部走 store 已有的公开动作，不改动 store API
function resetDefaults() {
  reader.setDirection('ltr');
  if (reader.layoutConfig.spread !== 2) reader.setSpreadCount(2);
  if (!reader.layoutConfig.coverOffset) reader.toggleCoverOffset();
  reader.setWebtoonFit('screen');
  reader.setFontSize(18);
}
</script>

<style scoped>
.reader-settings-scroll { scrollbar-gutter: auto; }
.reader-settings-scroll:not(.has-overflow) { scrollbar-width: none; }
.reader-settings-scroll:not(.has-overflow)::-webkit-scrollbar { display: none; }
.reader-settings-scroll::-webkit-scrollbar-thumb { background: var(--md-outline); }
.reader-font-number {
  width: 100%;
  min-width: 0;
  height: 48px;
  appearance: textfield;
  border: 1px solid var(--md-outline-variant);
  border-radius: 16px;
  background: transparent;
  color: var(--md-on-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  transition:
    border-color var(--md-duration-short) var(--md-ease-emphasized),
    box-shadow var(--md-duration-short) var(--md-ease-emphasized);
}
.reader-font-number::-webkit-inner-spin-button,
.reader-font-number::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}
@media (hover: hover) and (pointer: fine) {
  .reader-font-number:hover { border-color: var(--md-on-surface-variant); }
}
.reader-font-number:focus {
  border-color: var(--md-primary);
  box-shadow: inset 0 0 0 1px var(--md-primary);
}
.reader-cover-preview {
  display: grid;
  width: 60px;
  aspect-ratio: 3 / 4;
  flex-shrink: 0;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--md-outline-variant);
  border-radius: 12px;
  background: var(--md-surface-high);
  color: var(--md-on-surface-variant);
}
.reader-cover-preview img { width: 100%; height: 100%; object-fit: cover; }
</style>
