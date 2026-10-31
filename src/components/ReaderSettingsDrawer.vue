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
      class="absolute z-50 flex flex-col bg-[var(--md-surface-container)] shadow-2xl"
      :class="isCompact
        ? 'inset-x-0 bottom-0 w-full max-h-[78dvh] rounded-t-[28px]'
        : 'inset-y-0 right-0 w-[372px] max-w-[92%] h-full rounded-l-[28px]'"
      :style="isCompact ? { paddingBottom: 'env(safe-area-inset-bottom)' } : null"
    >
      <div v-if="isCompact" class="pt-2.5 pb-1 flex justify-center shrink-0">
        <span class="w-8 h-1 rounded-full bg-[var(--md-outline-variant)]"></span>
      </div>

      <div class="px-[22px] pt-2 pb-1 flex items-center justify-between shrink-0">
        <h3 class="text-[17px] font-semibold leading-tight">阅读设置</h3>
        <button
          @click="ui.closeSettings()"
          class="md-hit-target w-10 h-10 -mr-1 rounded-full grid place-items-center text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-high)] transition-colors"
          title="关闭"
          aria-label="关闭阅读设置"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto overscroll-contain px-[22px] pb-2">
        <!-- 阅读方向 -->
        <section class="py-3.5 border-t-[0.5px] border-[var(--md-outline-variant)]">
          <div class="flex items-baseline justify-between mb-3">
            <span class="text-[12px] font-semibold">阅读方向</span>
            <b class="font-mono text-[12px] font-medium text-[var(--md-on-surface-variant)]">{{ directionLabel }}</b>
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
            <span class="text-[12px] font-medium">左右翻页按钮反转</span>
          </MdSwitch>
        </section>

        <!-- 翻页布局 -->
        <section class="py-3.5 border-t-[0.5px] border-[var(--md-outline-variant)]">
          <div class="flex items-baseline justify-between mb-3">
            <span class="text-[12px] font-semibold">翻页布局</span>
            <b class="font-mono text-[12px] font-medium text-[var(--md-on-surface-variant)]">{{ spreadLabel }}</b>
          </div>
          <MdSegmentedControl
            class="w-full"
            :model-value="isVertical ? -1 : config.spread"
            :options="spreadOptions"
            aria-label="翻页布局"
            @update:model-value="value => reader.setSpreadCount(Number(value))"
          />

          <p v-if="!isVertical && config.spread === 2 && isPhone" class="mt-3 text-[12px] text-[var(--md-on-surface-variant)] leading-relaxed">
            窄屏会自动按单页显示，改大窗口或横屏后可恢复双页。
          </p>

          <MdSwitch
            v-if="!isVertical && config.spread === 2"
            class="mt-3.5"
            :model-value="config.coverOffset"
            title="双页模式下首页单独显示，确保后续跨页大图对齐"
            @update:model-value="reader.toggleCoverOffset()"
          >
            <span class="text-[12px] font-medium">首页单排</span>
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
        <section v-if="!isManga" class="py-3.5 border-t-[0.5px] border-[var(--md-outline-variant)]">
          <div class="flex items-baseline justify-between mb-3">
            <span class="text-[12px] font-semibold">字号</span>
            <b class="font-mono text-[12px] font-medium text-[var(--md-on-surface-variant)]">{{ config.fontSize }} px</b>
          </div>
          <div class="flex items-center gap-3">
            <button
              @click="reader.changeFontSize(-2)"
              class="w-11 h-11 rounded-full grid place-items-center bg-[var(--md-surface-high)] text-[var(--md-on-surface)] hover:bg-[var(--md-surface-highest)] transition-colors"
              title="减小字号"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2.4" d="M6 12h12"/></svg>
            </button>
            <span class="flex-1 text-center font-mono text-[12px]">A</span>
            <button
              @click="reader.changeFontSize(2)"
              class="w-11 h-11 rounded-full grid place-items-center bg-[var(--md-surface-high)] text-[var(--md-on-surface)] hover:bg-[var(--md-surface-highest)] transition-colors"
              title="增大字号"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2.4" d="M12 6v12M6 12h12"/></svg>
            </button>
          </div>
        </section>

        <!-- 外观 -->
        <section class="py-3.5 border-t-[0.5px] border-b-[0.5px] border-[var(--md-outline-variant)]">
          <div class="flex items-baseline justify-between mb-3">
            <span class="text-[12px] font-semibold">阅读模式</span>
            <b class="font-mono text-[12px] font-medium text-[var(--md-on-surface-variant)]">{{ modeLabel }}</b>
          </div>
          <MdSegmentedControl
            class="w-full"
            :model-value="theme.surfaceMode"
            :options="modes"
            aria-label="阅读模式"
            @update:model-value="onSurfaceModeChange"
          />

          <div class="flex items-baseline justify-between mt-4 mb-3">
            <span class="text-[12px] font-semibold">主题色</span>
            <b class="font-mono text-[12px] font-medium text-[var(--md-on-surface-variant)]">{{ themeLabel }}</b>
          </div>
          <ThemeSwatchGrid />

          <button
            @click="theme.toggleTransitionStyle()"
            class="w-full min-h-11 flex items-center justify-between mt-2"
            title="切换翻页过渡动画效果"
          >
            <span class="text-[12px] font-medium">翻页过渡</span>
            <span class="font-mono text-[12px] text-[var(--md-primary)]">{{ TRANSITION_LABELS[theme.transitionStyle] }}</span>
          </button>
        </section>
      </div>

      <!-- 底部操作 -->
      <div class="shrink-0 px-[22px] pt-3 pb-4 flex gap-2.5">
        <button
          @click="resetDefaults"
          class="flex-1 h-11 rounded-full text-[13px] font-semibold text-[var(--md-primary)] hover:bg-[var(--md-surface-high)] transition-colors"
        >恢复默认</button>
        <button
          @click="ui.closeSettings()"
          class="flex-1 h-11 rounded-full text-[13px] font-semibold bg-[var(--md-primary)] text-[var(--md-on-primary)] hover:opacity-90 transition-opacity"
        >完成</button>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { useReaderStore, WEBTOON_FIT_LABELS } from '../stores/reader.js';
import { THEME_OPTIONS, useThemeStore, TRANSITION_LABELS } from '../stores/theme.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';
import { showToast } from '../composables/useToast.js';
import MdSegmentedControl from './MdSegmentedControl.vue';
import MdSwitch from './MdSwitch.vue';
import ThemeSwatchGrid from './ThemeSwatchGrid.vue';

const reader = useReaderStore();
const theme = useThemeStore();
const ui = useUiStore();
const { isPhone, isCompact } = useViewport();
const config = reader.layoutConfig;

const isVertical = computed(() => config.direction === 'vertical');
const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

const directions = [
  { value: 'ltr', label: '从左到右', title: '普通排版' },
  { value: 'rtl', label: '从右到左', title: '日漫' },
  { value: 'vertical', label: '条漫模式', title: '条漫长卷' }
];

const spreadOptions = [
  { value: 1, label: '单页' },
  { value: 2, label: '双页' }
];

const webtoonFits = [
  { value: 'screen', label: WEBTOON_FIT_LABELS.screen },
  { value: 'medium', label: WEBTOON_FIT_LABELS.medium },
  { value: 'wide', label: WEBTOON_FIT_LABELS.wide }
];

const modes = [
  { value: 'light', label: '白昼' },
  { value: 'dark', label: '夜间' },
  { value: 'warm', label: '护眼' }
];

const directionLabel = computed(() => (directions.find(d => d.value === config.direction) || directions[0]).label);
const spreadLabel = computed(() => (isVertical.value ? '长卷' : (config.spread === 2 ? '双页' : '单页')));
const modeLabel = computed(() => (modes.find(m => m.value === theme.surfaceMode) || modes[0]).label);
const themeLabel = computed(() => (THEME_OPTIONS.find(option => option.name === theme.themeColor) || THEME_OPTIONS[0]).title.replace(' (默认)', ''));

function onSurfaceModeChange(value, origin) {
  theme.setSurfaceMode(value, false, origin);
}

// 恢复默认：全部走 store 已有的公开动作，不改动 store API
function resetDefaults() {
  reader.setDirection('ltr');
  if (reader.layoutConfig.spread !== 2) reader.setSpreadCount(2);
  if (!reader.layoutConfig.coverOffset) reader.toggleCoverOffset();
  reader.setWebtoonFit('screen');
  while (reader.layoutConfig.fontSize > 18) reader.changeFontSize(-2);
  while (reader.layoutConfig.fontSize < 18) reader.changeFontSize(2);
  showToast('已恢复默认阅读设置');
}
</script>
