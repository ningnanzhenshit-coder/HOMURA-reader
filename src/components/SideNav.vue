<template>
  <!-- 桌面侧栏：品牌 / 书库 / 外观设置（可收起） -->
  <aside
    v-if="!isPhone"
    class="shrink-0 border-r border-[var(--border-line)] bg-[var(--bg-card)] flex flex-col sticky top-0 h-screen z-30 transition-[width] duration-200 ease-out"
    :class="collapsed ? 'w-16' : 'w-[220px]'"
  >
    <!-- 顶部：展开时显示品牌行，收起时只保留居中按钮 -->
    <div
      class="shrink-0 flex items-center border-b border-[var(--border-line)] transition-[height] duration-200"
      :class="collapsed ? 'h-11 justify-center' : 'h-16 px-3 gap-2.5'"
    >
      <template v-if="!collapsed">
        <img
          :src="logoUrl"
          alt="HOMURA"
          class="w-9 h-9 shrink-0 select-none pointer-events-none"
          draggable="false"
        />
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
        class="absolute p-3 rounded-xl border border-[var(--border-line)] bg-[var(--bg-card)] shadow-xl z-40"
        :class="collapsed ? 'left-full bottom-0 ml-2 w-[220px]' : 'bottom-full left-3 right-3 mb-2'"
      >
        <AppearancePanel />
      </div>
    </div>
  </aside>

  <!-- 移动端底部标签栏 -->
  <nav
    v-else
    class="mobile-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-line)] bg-[var(--bg-card)] flex items-stretch"
  >
    <button
      @click="onShelfTab"
      class="flex-1 min-h-[3.5rem] flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-[var(--brand-primary)]"
      title="书架"
    >
      <span class="relative">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z"/>
        </svg>
        <span class="absolute -top-1.5 -right-2.5 px-1 rounded-full bg-[var(--brand-primary)] text-[9px] leading-3 font-mono text-white">{{ shelf.library.length }}</span>
      </span>
      <span>书架</span>
    </button>
    <button
      @click="appearanceOpen = !appearanceOpen"
      class="flex-1 min-h-[3.5rem] flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold"
      :class="appearanceOpen ? 'text-[var(--brand-primary)]' : 'text-[var(--fg-muted)]'"
      title="外观设置"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a9 9 0 100 18h1.5a2.5 2.5 0 000-5H12a2 2 0 010-4h4a4 4 0 004-4 5 5 0 00-5-5h-3z"/>
      </svg>
      <span>外观</span>
    </button>
  </nav>

  <!-- 移动端外观底部弹层 -->
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isPhone && appearanceOpen"
      class="fixed inset-0 z-50 bg-black/30"
      @click="appearanceOpen = false"
    ></div>
  </Transition>
  <Transition
    enter-active-class="transition-transform duration-200 ease-out"
    enter-from-class="translate-y-full"
    enter-to-class="translate-y-0"
    leave-active-class="transition-transform duration-150 ease-in"
    leave-from-class="translate-y-0"
    leave-to-class="translate-y-full"
  >
    <div
      v-if="isPhone && appearanceOpen"
      class="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t border-[var(--border-line)] bg-[var(--bg-card)] shadow-2xl px-4 pt-2.5"
      style="padding-bottom: calc(1rem + env(safe-area-inset-bottom));"
    >
      <div class="w-10 h-1 rounded-full bg-[var(--border-line)] mx-auto mb-3"></div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-display font-bold tracking-tight">外观设置</h3>
        <button
          @click="appearanceOpen = false"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]"
          title="关闭"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <AppearancePanel />
    </div>
  </Transition>
</template>

<script setup>
import { ref, watchEffect } from 'vue';
import { useShelfStore } from '../stores/shelf.js';
import { useViewport } from '../composables/useViewport.js';
import AppearancePanel from './AppearancePanel.vue';
import logoUrl from '../assets/logo.png';

const shelf = useShelfStore();
const { isPhone } = useViewport();

const appearanceOpen = ref(false);

function onShelfTab() {
  appearanceOpen.value = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 侧栏收起状态：本地 UI 偏好，直接持久化到 localStorage（仅桌面）
const SIDEBAR_KEY = 'homura_sidebar_collapsed';
const collapsed = ref(false);
try {
  collapsed.value = localStorage.getItem(SIDEBAR_KEY) === '1';
} catch (e) {}

// 侧栏宽度同步到全局 CSS 变量：toast 等 fixed 元素据此在书架内容区居中
// 移动端侧栏变成底部标签栏，宽度记为 0
watchEffect(() => {
  const width = isPhone.value ? '0px' : (collapsed.value ? '4rem' : '220px');
  document.documentElement.style.setProperty('--sidenav-width', width);
});

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed.value ? '1' : '0');
  } catch (e) {}
}
</script>
