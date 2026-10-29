<template>
  <!-- 阅读设置抽屉 -->
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="ui.settingsOpen" class="absolute inset-0 z-40 bg-black/25" @click="ui.closeSettings()"></div>
  </Transition>

  <Transition
    enter-active-class="transition-transform duration-200 ease-out"
    :enter-from-class="isPhone ? 'translate-y-full' : 'translate-x-full'"
    :enter-to-class="isPhone ? 'translate-y-0' : 'translate-x-0'"
    leave-active-class="transition-transform duration-150 ease-in"
    :leave-from-class="isPhone ? 'translate-y-0' : 'translate-x-0'"
    :leave-to-class="isPhone ? 'translate-y-full' : 'translate-x-full'"
  >
    <aside
      v-if="ui.settingsOpen"
      class="absolute z-50 bg-[var(--bg-card)] shadow-2xl flex flex-col border-[var(--border-line)]"
      :class="isPhone
        ? 'inset-x-0 bottom-0 w-full max-h-[78dvh] rounded-t-2xl border-t'
        : 'inset-y-0 right-0 w-[320px] max-w-[88%] h-full border-l'"
      :style="isPhone ? { paddingBottom: 'env(safe-area-inset-bottom)' } : null"
    >
      <div v-if="isPhone" class="pt-2.5 pb-1 flex justify-center shrink-0">
        <span class="w-10 h-1 rounded-full bg-[var(--border-line)]"></span>
      </div>
      <div class="h-14 px-4 flex items-center justify-between border-b border-[var(--border-line)] shrink-0">
        <h3 class="text-sm font-display font-bold tracking-tight">阅读设置</h3>
        <button @click="ui.closeSettings()" class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--fg-muted)] hover:text-[var(--fg-main)] hover:bg-[var(--bg-subtle)] transition" title="关闭">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <!-- 阅读方向 -->
        <section class="space-y-2">
          <p class="text-[11px] font-mono font-bold tracking-widest text-[var(--fg-muted)]">阅读方向</p>
          <div class="flex flex-col gap-1.5">
            <button
              v-for="d in directions"
              :key="d.value"
              @click="reader.setDirection(d.value)"
              class="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition"
              :style="dirStyle(d.value)"
            >
              <span>{{ d.label }}</span>
              <span class="text-[10px] opacity-70">{{ d.hint }}</span>
            </button>
          </div>
          <button
            v-if="config.direction === 'rtl'"
            @click="reader.toggleRtlTapInvert()"
            class="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)] text-xs font-semibold"
          >
            <span>左右翻页按钮反转</span>
            <span class="font-mono text-[10px] text-[var(--brand-primary)]">{{ config.rtlInvertButtons ? '开' : '关' }}</span>
          </button>
        </section>

        <!-- 翻页布局 -->
        <section class="space-y-2">
          <p class="text-[11px] font-mono font-bold tracking-widest text-[var(--fg-muted)]">翻页布局</p>
          <div class="flex items-center p-0.5 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)]">
            <button @click="reader.setSpreadCount(1)" :style="segStyle(!isVertical && config.spread === 1)" class="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition">单页</button>
            <button @click="reader.setSpreadCount(2)" :style="segStyle(!isVertical && config.spread === 2)" class="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition">双页</button>
          </div>
          <p
            v-if="!isVertical && config.spread === 2 && isPhone"
            class="w-full text-left px-3 py-2 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)] text-[10px] text-[var(--fg-muted)] leading-relaxed"
          >
            窄屏会自动按单页显示，改大窗口或横屏后可恢复双页。
          </p>
          <button
            v-if="!isVertical && config.spread === 2"
            @click="reader.toggleCoverOffset()"
            class="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)] text-xs font-semibold"
            title="双页模式下首页单独显示，确保后续跨页大图对齐"
          >
            <span>首页单排</span>
            <span class="font-mono text-[10px] text-[var(--brand-primary)]">{{ config.coverOffset ? '开' : '关' }}</span>
          </button>
          <div v-if="isVertical && isManga" class="flex items-center p-0.5 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)]">
            <button
              v-for="f in webtoonFits"
              :key="f.value"
              @click="setWebtoonFit(f.value)"
              :style="segStyle(config.webtoonFit === f.value)"
              class="flex-1 px-1 py-1.5 rounded-md text-[11px] font-semibold transition"
            >
              {{ f.label }}
            </button>
          </div>
        </section>

        <!-- 排版 -->
        <section v-if="!isManga" class="space-y-2">
          <p class="text-[11px] font-mono font-bold tracking-widest text-[var(--fg-muted)]">排版</p>
          <div class="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)]">
            <span class="text-xs font-semibold">字号</span>
            <div class="flex items-center gap-2">
              <button @click="reader.changeFontSize(-2)" class="w-6 h-6 rounded-md border border-[var(--border-line)] bg-[var(--bg-card)] text-xs font-bold">A-</button>
              <span class="font-mono text-[11px] text-[var(--fg-muted)] min-w-[20px] text-center">{{ config.fontSize }}</span>
              <button @click="reader.changeFontSize(2)" class="w-6 h-6 rounded-md border border-[var(--border-line)] bg-[var(--bg-card)] text-xs font-bold">A+</button>
            </div>
          </div>
        </section>

        <!-- 外观 -->
        <section class="space-y-2">
          <p class="text-[11px] font-mono font-bold tracking-widest text-[var(--fg-muted)]">外观</p>
          <button
            @click="theme.toggleTransitionStyle()"
            class="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)] text-xs font-semibold"
            title="切换翻页过渡动画效果"
          >
            <span>翻页过渡</span>
            <span class="font-mono text-[10px] text-[var(--brand-primary)]">{{ TRANSITION_LABELS[theme.transitionStyle] }}</span>
          </button>
          <div class="flex items-center p-0.5 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)]">
            <button v-for="m in modes" :key="m.name" @click="theme.setSurfaceMode(m.name)" :style="segStyle(theme.surfaceMode === m.name)" class="flex-1 px-1 py-1.5 rounded-md text-[11px] font-semibold transition inline-flex items-center justify-center gap-1">
              <svg v-if="m.name === 'light'" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" stroke-width="2"/>
                <path stroke-linecap="round" stroke-width="2" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
              </svg>
              <svg v-else-if="m.name === 'warm'" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20c8 0 16-4 16-16-8 0-16 4-16 16z"/>
                <path stroke-linecap="round" stroke-width="2" d="M4 20c4-4 8-6 12-8"/>
              </svg>
              <svg v-else class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.8A8.5 8.5 0 1111.2 3a6.5 6.5 0 009.8 9.8z"/>
              </svg>
              <span>{{ m.label }}</span>
            </button>
          </div>
          <div class="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--border-line)] bg-[var(--bg-subtle)]">
            <span class="text-xs font-semibold">主题色</span>
            <div class="flex items-center gap-2">
              <button
                v-for="s in swatches"
                :key="s.name"
                @click="theme.setThemeColor(s.name)"
                :class="['theme-swatch', s.cls, { 'active-swatch': theme.themeColor === s.name }]"
                :title="s.title"
              ></button>
            </div>
          </div>
        </section>
      </div>
    </aside>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { useReaderStore, WEBTOON_FIT_LABELS } from '../stores/reader.js';
import { useThemeStore, TRANSITION_LABELS } from '../stores/theme.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';

const reader = useReaderStore();
const theme = useThemeStore();
const ui = useUiStore();
const { isPhone } = useViewport();
const config = reader.layoutConfig;

const isVertical = computed(() => config.direction === 'vertical');
const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

const directions = [
  { value: 'ltr', label: '左→右', hint: '普通排版' },
  { value: 'rtl', label: '右→左', hint: '日漫' },
  { value: 'vertical', label: '上→下', hint: '条漫长卷' }
];

const webtoonFits = [
  { value: 'screen', label: WEBTOON_FIT_LABELS.screen },
  { value: 'medium', label: WEBTOON_FIT_LABELS.medium },
  { value: 'wide', label: WEBTOON_FIT_LABELS.wide }
];

const modes = [
  { name: 'light', label: '白昼' },
  { name: 'warm', label: '护眼' },
  { name: 'dark', label: '夜间' }
];

const swatches = [
  { name: 'blue', cls: 'bg-[#2563EB]', title: '晴空蓝 (默认)' },
  { name: 'red', cls: 'bg-[#E61919]', title: '绯红金' },
  { name: 'green', cls: 'bg-[#059669]', title: '森系绿' },
  { name: 'violet', cls: 'bg-[#7C3AED]', title: '星夜紫' }
];

function dirStyle(value) {
  const active = config.direction === value;
  return active
    ? { backgroundColor: 'var(--brand-primary)', color: '#FFFFFF', borderColor: 'var(--brand-primary)' }
    : { backgroundColor: 'var(--bg-subtle)', color: 'var(--fg-muted)', borderColor: 'var(--border-line)' };
}

function segStyle(active) {
  return active
    ? { backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }
    : { backgroundColor: 'transparent', color: 'var(--fg-muted)' };
}

function setWebtoonFit(value) {
  reader.setWebtoonFit(value);
}
</script>
