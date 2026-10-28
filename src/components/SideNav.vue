<template>
  <!-- 左侧导航栏：品牌 / 书库 / 外观设置（可收起） -->
  <aside
    class="shrink-0 border-r border-[var(--border-line)] bg-[var(--bg-card)] flex flex-col sticky top-0 h-screen z-30 transition-[width] duration-200 ease-out"
    :class="collapsed ? 'w-16' : 'w-[220px]'"
  >
    <!-- 顶部：展开时显示品牌行，收起时只保留居中按钮 -->
    <div
      class="shrink-0 flex items-center border-b border-[var(--border-line)] transition-[height] duration-200"
      :class="collapsed ? 'h-11 justify-center' : 'h-16 px-3 gap-2.5'"
    >
      <template v-if="!collapsed">
        <div class="w-9 h-9 rounded-xl bg-[#E61919] flex items-center justify-center shadow-md shadow-red-500/15 border border-red-600/30 shrink-0">
          <svg class="w-7 h-7" viewBox="0 0 120 115" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(10, 3)">
              <path d="M10 20 C10 18, 16 18, 20 19 L20 62 C26 63, 35 66, 44 71 L44 75 C33 69, 20 66, 10 65 Z" fill="#FFC400"/>
              <path d="M18 14 C18 12, 24 12, 28 13 L28 56 C33 57, 40 60, 46 65 L46 69 C37 63, 26 60, 18 59 Z" fill="#FFC400"/>
              <path d="M29 7 C37 8, 44 13, 48 20 L48 65 C43 58, 36 54, 29 52 Z" fill="#FFC400"/>
              <path d="M84 7 C68 8, 56 13, 51 20 L51 64 C59 56, 71 52, 84 52 L84 40 L76 40 C73 40, 72 36, 75 34 L84 27 Z" fill="#FFC400"/>
              <path d="M51 69 C61 60, 72 57, 83 57 L78 63 C76 66, 79 70, 83 67 L95 54 C97 52, 97 49, 95 47 L83 34 C79 31, 76 35, 78 38 L83 44 C70 44, 59 49, 51 59 Z" fill="#FFC400"/>
            </g>
            <text x="60" y="92" font-family="sans-serif" font-size="17" font-weight="900" fill="#FFFFFF" text-anchor="middle">ACGN</text>
            <text x="60" y="109" font-family="sans-serif" font-size="16" font-weight="900" fill="#FFFFFF" text-anchor="middle">GO</text>
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="font-display font-extrabold text-base leading-tight tracking-tight truncate">HOMURA</h1>
          <span class="text-[10px] font-mono font-bold tracking-wider text-[var(--brand-primary)]">ACGN·GO</span>
        </div>
      </template>

      <button
        @click="toggleCollapsed"
        class="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition"
        :class="collapsed
          ? 'bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] hover:bg-[var(--brand-primary)] hover:text-[var(--brand-on-primary)]'
          : 'bg-[var(--bg-card)] text-[var(--fg-muted)] border border-[var(--border-line)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg-main)]'"
        :title="collapsed ? '展开侧栏' : '收起侧栏'"
      >
        <svg
          class="w-4 h-4 transition-transform duration-200"
          :class="{ 'rotate-180': collapsed }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
    </div>

    <nav :class="collapsed ? 'flex-1 p-2 flex flex-col items-center gap-2' : 'flex-1 p-3 space-y-1'">
      <p v-if="!collapsed" class="px-2 pb-2 text-[10px] font-mono font-bold tracking-widest text-[var(--fg-muted)]">书库</p>
      <button
        class="flex items-center rounded-lg font-semibold bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)]"
        :class="collapsed ? 'w-10 h-10 justify-center' : 'w-full gap-2.5 px-2.5 py-2 text-sm'"
        :title="collapsed ? '书架 · ' + shelf.library.length : '当前书架'"
      >
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z"/>
        </svg>
        <template v-if="!collapsed">
          <span class="flex-1 text-left">书架</span>
          <span class="font-mono text-[10px] opacity-80">{{ shelf.library.length }}</span>
        </template>
      </button>
    </nav>

    <div
      class="border-t border-[var(--border-line)] relative shrink-0"
      :class="collapsed ? 'p-2 flex justify-center' : 'p-3'"
    >
      <button
        @click="appearanceOpen = !appearanceOpen"
        class="flex items-center rounded-lg font-semibold transition"
        :class="[
          collapsed ? 'w-10 h-10 justify-center' : 'w-full gap-2.5 px-2.5 py-2 text-sm',
          appearanceOpen
            ? 'bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)]'
            : 'text-[var(--fg-muted)] hover:text-[var(--fg-main)] border border-transparent'
        ]"
        :title="collapsed ? '外观' : ''"
      >
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a9 9 0 100 18h1.5a2.5 2.5 0 000-5H12a2 2 0 010-4h4a4 4 0 004-4 5 5 0 00-5-5h-3z"/>
        </svg>
        <template v-if="!collapsed">
          <span class="flex-1 text-left">外观</span>
          <svg class="w-3 h-3 shrink-0 transition-transform" :class="{ 'rotate-180': appearanceOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 9l6 6 6-6"/>
          </svg>
        </template>
      </button>

      <!-- 外观设置面板：主题色 + 阅读模式（收起时向右浮出） -->
      <div
        v-if="appearanceOpen"
        class="absolute p-3 rounded-xl border border-[var(--border-line)] bg-[var(--bg-card)] shadow-xl space-y-3 z-40"
        :class="collapsed ? 'left-full bottom-0 ml-2 w-[220px]' : 'bottom-full left-3 right-3 mb-2'"
      >
        <div>
          <p class="text-[10px] font-semibold text-[var(--fg-muted)] mb-2">主题色</p>
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
        <div>
          <p class="text-[10px] font-semibold text-[var(--fg-muted)] mb-2">阅读模式</p>
          <div class="flex flex-col gap-1.5">
            <button
              v-for="m in modes"
              :key="m.name"
              @click="theme.setSurfaceMode(m.name)"
              class="w-full flex items-center gap-1.5 text-left px-2.5 py-1.5 rounded-md text-xs font-semibold transition"
              :style="modeBtnStyle(m.name)"
              :title="m.title"
            >
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
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref } from 'vue';
import { useShelfStore } from '../stores/shelf.js';
import { useThemeStore } from '../stores/theme.js';

const shelf = useShelfStore();
const theme = useThemeStore();

const appearanceOpen = ref(false);

// 侧栏收起状态：本地 UI 偏好，直接持久化到 localStorage
const SIDEBAR_KEY = 'homura_sidebar_collapsed';
const collapsed = ref(false);
try {
  collapsed.value = localStorage.getItem(SIDEBAR_KEY) === '1';
} catch (e) {}

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed.value ? '1' : '0');
  } catch (e) {}
}

const swatches = [
  { name: 'blue', cls: 'bg-[#2563EB]', title: '晴空蓝 (默认)' },
  { name: 'red', cls: 'bg-[#E61919]', title: '绯红金' },
  { name: 'green', cls: 'bg-[#059669]', title: '森系绿' },
  { name: 'violet', cls: 'bg-[#7C3AED]', title: '星夜紫' }
];

const modes = [
  { name: 'light', label: '白昼', title: '纯净白昼模式' },
  { name: 'warm', label: '护眼', title: '暖色调护眼模式（羊皮纸色 + 柔光滤镜）' },
  { name: 'dark', label: '夜间', title: '深邃夜间模式' }
];

function modeBtnStyle(name) {
  return theme.surfaceMode === name
    ? { backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }
    : { backgroundColor: 'var(--bg-subtle)', color: 'var(--fg-muted)' };
}
</script>
