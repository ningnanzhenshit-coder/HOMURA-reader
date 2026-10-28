<template>
  <!-- Reader Compact Topbar -->
  <div class="min-h-12 border-b border-[var(--border-line)] bg-[var(--bg-card)]/95 backdrop-blur px-3 sm:px-5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0 z-20">
    <!-- Left: Back & Title -->
    <div class="flex items-center gap-2.5 flex-1 min-w-[4.25rem]">
      <button @click="reader.closeReader()" class="uiverse-btn py-1 px-2.5 shrink-0">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 19l-7-7 7-7"/></svg>
        <span class="hidden sm:inline">书架</span>
      </button>
      <div class="min-w-0">
        <h2 class="text-xs sm:text-sm font-bold truncate">{{ reader.currentBook ? reader.currentBook.title : '' }}</h2>
        <p class="text-[10px] font-mono text-[var(--brand-primary)] truncate hidden sm:block">{{ subStatus }}</p>
      </div>
    </div>

    <!-- Center: Visual Mode Switcher Pills -->
    <div class="flex items-center gap-1 bg-[var(--bg-subtle)] p-1 rounded-lg border border-[var(--border-line)] shrink-0 whitespace-nowrap">
      <button @click="reader.setDirection('ltr')" :style="pillStyle('ltr')" class="px-2.5 py-1 rounded text-xs font-semibold transition flex items-center gap-1" title="左页先读·右页后读，下一页在右边">
        <span>左→右</span>
      </button>
      <button @click="reader.setDirection('rtl')" :style="pillStyle('rtl')" class="px-2.5 py-1 rounded text-xs font-semibold transition flex items-center gap-1" title="日本漫画排布：双页时右页先读、左页后读，且下一页在左边">
        <span>右→左(日漫)</span>
      </button>
      <button @click="reader.setDirection('vertical')" :style="pillStyle('vertical')" class="px-2.5 py-1 rounded text-xs font-semibold transition flex items-center gap-1" title="上下条漫瀑布流 / 长卷连续滚动">
        <span>上→下(条漫)</span>
      </button>

      <div class="w-px h-3.5 bg-[var(--border-line)] mx-0.5"></div>

      <button @click="reader.setSpreadCount(1)" :style="spreadPillStyle(1)" class="px-2.5 py-1 rounded text-xs font-semibold transition" title="单页显示">
        单页
      </button>
      <button @click="reader.setSpreadCount(2)" :style="spreadPillStyle(2)" class="px-2.5 py-1 rounded text-xs font-semibold transition flex items-center gap-1" title="双页并排最大化显示">
        <span>双页</span>
      </button>
    </div>

    <!-- Right: Extra Options -->
    <div class="flex items-center gap-1.5 shrink-0">
      <!-- Transition Style Toggle: Slide / Fade / Instant -->
      <button @click="theme.toggleTransitionStyle()" class="hidden lg:flex uiverse-btn py-1 px-2 text-[11px]" title="切换翻页过渡动画效果：丝滑平移 / 柔和淡入 / 极速无动画">
        <span>过渡:</span><span class="font-bold text-[var(--brand-primary)]">{{ TRANSITION_LABELS[theme.transitionStyle] }}</span>
      </button>

      <!-- Keep the xl-only button in flow and just hide its paint, so toggling it never shifts the centered toolbar -->
      <button @click="reader.toggleCoverOffset()" :class="{ invisible: isVertical || config.spread !== 2 }" class="hidden xl:flex uiverse-btn py-1 px-2 text-[11px]" title="双页模式下首页单独显示，确保后续跨页大图对齐">
        <span>首页单排:</span><span class="font-bold text-[var(--brand-primary)]">{{ config.coverOffset ? '开' : '关' }}</span>
      </button>

      <!-- Webtoon Width Switcher（槽位常驻，不切条漫漫画时不显示，避免顶栏跳动） -->
      <button @click="reader.toggleWebtoonWidth()" :class="{ invisible: !(isVertical && isManga) }" class="uiverse-btn py-1 px-2 text-[11px]" title="切换条漫图片显示尺寸：完整适配一屏高度 / 适中宽度 / 宽屏">
        <span>条漫尺寸:</span><span class="font-bold text-[var(--brand-primary)]">{{ WEBTOON_FIT_LABELS[config.webtoonFit] }}</span>
      </button>

      <div :class="isManga ? 'hidden' : 'hidden sm:flex'" class="items-center bg-[var(--bg-subtle)] rounded-lg p-0.5 border border-[var(--border-line)]">
        <button @click="reader.changeFontSize(-2)" class="px-2 py-0.5 text-xs font-bold">A-</button>
        <span class="text-[11px] font-mono px-1 text-[var(--fg-muted)]">{{ config.fontSize }}</span>
        <button @click="reader.changeFontSize(2)" class="px-2 py-0.5 text-xs font-bold">A+</button>
      </div>

      <!-- Reader Quick Surface Switcher (Light / Warm Eye-Care / Dark) -->
      <div class="flex items-center bg-[var(--bg-subtle)] p-0.5 rounded-lg border border-[var(--border-line)]">
        <button @click="theme.setSurfaceMode('light')" :style="modeBtnStyle('light')" class="px-1.5 py-0.5 rounded text-[11px] font-semibold transition" title="白昼模式">☀️</button>
        <button @click="theme.setSurfaceMode('warm')" :style="modeBtnStyle('warm')" class="px-1.5 py-0.5 rounded text-[11px] font-semibold transition" title="暖色调护眼模式">🌾护眼</button>
        <button @click="theme.setSurfaceMode('dark')" :style="modeBtnStyle('dark')" class="px-1.5 py-0.5 rounded text-[11px] font-semibold transition" title="夜间模式">🌙</button>
      </div>

      <!-- Reader Mini Color Swatches -->
      <div class="hidden lg:flex items-center gap-1 px-1.5 py-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-line)]">
        <button @click="theme.setThemeColor('blue')" class="theme-swatch !w-3.5 !h-3.5 bg-[#2563EB]" :class="{ 'active-swatch': theme.themeColor === 'blue' }" title="晴空蓝"></button>
        <button @click="theme.setThemeColor('red')" class="theme-swatch !w-3.5 !h-3.5 bg-[#E61919]" :class="{ 'active-swatch': theme.themeColor === 'red' }" title="绯红金"></button>
        <button @click="theme.setThemeColor('green')" class="theme-swatch !w-3.5 !h-3.5 bg-[#059669]" :class="{ 'active-swatch': theme.themeColor === 'green' }" title="森系绿"></button>
        <button @click="theme.setThemeColor('violet')" class="theme-swatch !w-3.5 !h-3.5 bg-[#7C3AED]" :class="{ 'active-swatch': theme.themeColor === 'violet' }" title="星夜紫"></button>
      </div>

      <button @click="theme.toggleFullScreen()" class="uiverse-btn py-1 px-2 text-xs font-mono" title="按 F 键切换全屏">
        <span>⛶</span><span class="hidden md:inline">F</span>
      </button>
    </div>
  </div>
</template>

<script setup>
/* ============================================================================
   HOMURA · 阅读器顶部工具栏
   ----------------------------------------------------------------------------
   方向 / 单双页 / 过渡效果 / 首页单排 / 条漫尺寸 / 字号 / 表面 / 色板 / 全屏。
   旧版 updateToolbarHighlight 的 setAttribute 高亮全部改为 :style / :class 绑定。
   ========================================================================== */

import { computed } from 'vue';
import { useReaderStore, WEBTOON_FIT_LABELS } from '../stores/reader.js';
import { useThemeStore, TRANSITION_LABELS } from '../stores/theme.js';

const reader = useReaderStore();
const theme = useThemeStore();
const config = reader.layoutConfig;

const isVertical = computed(() => config.direction === 'vertical');
const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');

function pillStyle(dir) {
  const active = config.direction === dir;
  return active
    ? 'background-color: var(--brand-primary); color: #FFFFFF;'
    : 'background-color: transparent; color: var(--fg-muted);';
}

function spreadPillStyle(count) {
  const active = !isVertical.value && config.spread === count;
  return active
    ? 'background-color: var(--brand-primary); color: #FFFFFF;'
    : 'background-color: transparent; color: var(--fg-muted);';
}

function modeBtnStyle(mode) {
  const active = theme.surfaceMode === mode;
  return active
    ? 'background-color: var(--brand-primary); color: #FFFFFF;'
    : 'background-color: transparent; color: var(--fg-muted);';
}

// Both labels share the same character count so the header text never changes width when toggling spread
const subStatus = computed(() => {
  const spreadLabel = config.spread === 2 ? '双页并排' : '单页模式';
  const inverted = config.direction === 'rtl' && config.rtlInvertButtons;
  if (config.direction === 'rtl') {
    return `日漫右→左 (${inverted ? '左边是下一页' : '右边是下一页'}) · 双缓冲丝滑翻页`;
  }
  if (config.direction === 'ltr') {
    return `左→右 (右边是下一页) · ${spreadLabel} · 双缓冲丝滑翻页`;
  }
  return '纵向长卷模式 · 连续平滑滚动';
});
</script>
