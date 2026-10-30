<template>
  <!-- 桌面：MD3 Navigation Rail（96px，图标在上标签在下） -->
  <aside
    v-if="!isCompact"
    class="shrink-0 sticky top-0 h-screen w-24 z-30 flex flex-col items-center pt-3.5 pb-4 bg-[var(--md-surface-low)] border-r border-[var(--md-outline-variant)]"
  >
    <div
      class="w-11 h-11 shrink-0 rounded-[14px] grid place-items-center mb-[22px] bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)] select-none"
      style="font-family: 'Songti SC', 'Instrument Serif', serif; font-style: italic; font-size: 26px; line-height: 1;"
      title="HOMURA"
    >H</div>

    <nav class="flex flex-col items-center gap-1.5 w-full">
      <button
        v-for="item in railItems"
        :key="item.key"
        @click="select(item.key)"
        class="w-full flex flex-col items-center gap-1 cursor-pointer group"
        :title="item.label"
      >
        <span
          class="w-14 h-8 rounded-2xl grid place-items-center transition-colors duration-200"
          :class="active === item.key
            ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]'
            : 'text-[var(--md-on-surface-variant)] group-hover:bg-[var(--md-surface-container)]'"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <template v-if="item.key === 'shelf'">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z"/>
            </template>
            <template v-else-if="item.key === 'recent'">
              <circle cx="12" cy="12" r="9" stroke-width="2"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v5l3 2"/>
            </template>
            <template v-else-if="item.key === 'favorite'">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 17.3l5.4 3.2-1.4-6.1 4.7-4.1-6.2-.5L12 4l-2.5 5.8-6.2.5 4.7 4.1-1.4 6.1z"/>
            </template>
            <template v-else>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.5 7.5l-9-4.5-9 4.5v9l9 4.5 9-4.5z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.5 7.5L11.5 12l8-4.5"/>
            </template>
          </svg>
        </span>
        <em
          class="not-italic text-[10.5px] font-semibold transition-colors duration-200"
          :class="active === item.key ? 'text-[var(--md-on-primary-container)]' : 'text-[var(--md-on-surface-variant)]'"
        >{{ item.label }}</em>
      </button>
    </nav>

    <!-- 底部固定：外观 / 设置 -->
    <div class="mt-auto flex flex-col items-center gap-1.5 w-full">
      <button
        @click="appearanceOpen = !appearanceOpen"
        class="w-full flex flex-col items-center gap-1 group"
        title="外观"
      >
        <span
          class="w-14 h-8 rounded-2xl grid place-items-center transition-colors duration-200"
          :class="appearanceOpen
            ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]'
            : 'text-[var(--md-on-surface-variant)] group-hover:bg-[var(--md-surface-container)]'"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a9 9 0 100 18h1.5a2.5 2.5 0 000-5H12a2 2 0 010-4h4a4 4 0 004-4 5 5 0 00-5-5h-3z"/>
          </svg>
        </span>
        <em class="not-italic text-[10.5px] font-semibold" :class="appearanceOpen ? 'text-[var(--md-on-primary-container)]' : 'text-[var(--md-on-surface-variant)]'">外观</em>
      </button>
      <button @click="onSettings" class="w-full flex flex-col items-center gap-1 group" title="设置（占位）">
        <span class="w-14 h-8 rounded-2xl grid place-items-center text-[var(--md-on-surface-variant)] group-hover:bg-[var(--md-surface-container)] transition-colors duration-200">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" stroke-width="2"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </span>
        <em class="not-italic text-[10.5px] font-semibold text-[var(--md-on-surface-variant)]">设置</em>
      </button>
    </div>
  </aside>

  <!-- 手机：MD3 Bottom Navigation -->
  <nav
    v-else
    class="fixed inset-x-0 bottom-0 z-40 flex items-center px-1.5 pt-1.5 bg-[var(--md-surface-container)] border-t border-[var(--md-outline-variant)]"
    style="height: calc(5rem + env(safe-area-inset-bottom)); padding-bottom: calc(0.625rem + env(safe-area-inset-bottom));"
  >
    <button
      v-for="item in bottomItems"
      :key="item.key"
      @click="item.key === 'appearance' ? (appearanceOpen = !appearanceOpen) : select(item.key)"
      class="flex-1 flex flex-col items-center gap-0.5 font-semibold text-[9.5px]"
      :class="item.key === 'appearance'
        ? (appearanceOpen ? 'text-[var(--md-on-primary-container)]' : 'text-[var(--md-on-surface-variant)]')
        : (active === item.key ? 'text-[var(--md-on-primary-container)]' : 'text-[var(--md-on-surface-variant)]')"
      :title="item.label"
    >
      <span
        class="w-[52px] h-[30px] rounded-[15px] grid place-items-center"
        :class="item.key === 'appearance'
          ? (appearanceOpen ? 'bg-[var(--md-primary-container)]' : '')
          : (active === item.key ? 'bg-[var(--md-primary-container)]' : '')"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <template v-if="item.key === 'shelf'">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z"/>
          </template>
          <template v-else-if="item.key === 'favorite'">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 17.3l5.4 3.2-1.4-6.1 4.7-4.1-6.2-.5L12 4l-2.5 5.8-6.2.5 4.7 4.1-1.4 6.1z"/>
          </template>
          <template v-else-if="item.key === 'recent'">
            <circle cx="12" cy="12" r="9" stroke-width="2"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v5l3 2"/>
          </template>
          <template v-else>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a9 9 0 100 18h1.5a2.5 2.5 0 000-5H12a2 2 0 010-4h4a4 4 0 004-4 5 5 0 00-5-5h-3z"/>
          </template>
        </svg>
      </span>
      <span>{{ item.label }}</span>
    </button>
  </nav>

  <!-- 外观浮层：桌面右侧弹出卡片 / 手机底部 sheet -->
  <Transition
    enter-active-class="md-fade-enter-active"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="md-fade-leave-active"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="appearanceOpen"
      class="fixed inset-0 z-40"
      :class="isCompact ? 'md-scrim-soft' : ''"
      @click="appearanceOpen = false"
    ></div>
  </Transition>

  <Transition
    enter-active-class="md-sheet-enter-active"
    :enter-from-class="isCompact ? 'translate-y-full opacity-0' : 'translate-y-2 opacity-0'"
    :enter-to-class="isCompact ? 'translate-y-0 opacity-100' : 'translate-y-0 opacity-100'"
    leave-active-class="md-sheet-leave-active"
    :leave-from-class="isCompact ? 'translate-y-0 opacity-100' : 'translate-y-0 opacity-100'"
    :leave-to-class="isCompact ? 'translate-y-full opacity-0' : 'translate-y-2 opacity-0'"
  >
    <div
      v-if="appearanceOpen"
      class="fixed z-50 bg-[var(--md-surface-container)] shadow-2xl"
      :class="isCompact
        ? 'inset-x-0 bottom-0 rounded-t-[28px] px-5 pt-2.5'
        : 'left-[104px] bottom-24 w-[280px] rounded-[20px] p-4'"
      :style="isCompact ? 'padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));' : null"
    >
      <div v-if="isCompact" class="w-8 h-1 rounded-full bg-[var(--md-outline-variant)] mx-auto mb-3"></div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-[15px] font-semibold">外观设置</h3>
        <button
          @click="appearanceOpen = false"
          class="w-8 h-8 rounded-full grid place-items-center text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-high)] transition-colors"
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
import { useViewport } from '../composables/useViewport.js';
import { showToast } from '../composables/useToast.js';
import AppearancePanel from './AppearancePanel.vue';

const { isCompact } = useViewport();

const active = ref('shelf');
const appearanceOpen = ref(false);
const emit = defineEmits(['nav']);

const railItems = [
  { key: 'shelf', label: '书架' },
  { key: 'recent', label: '最近' },
  { key: 'favorite', label: '收藏' },
  { key: 'tag', label: '标签' }
];

const bottomItems = [
  { key: 'shelf', label: '书架' },
  { key: 'recent', label: '最近' },
  { key: 'favorite', label: '收藏' },
  { key: 'appearance', label: '外观' }
];

function select(key) {
  active.value = key;
  appearanceOpen.value = false;
  emit('nav', key);
  if (key === 'favorite') showToast('收藏功能即将上线');
  if (key === 'tag') showToast('标签功能即将上线');
}

function onSettings() {
  showToast('设置功能即将上线');
}

// rail 宽度同步到全局 CSS 变量：toast 等 fixed 元素据此在书架内容区居中
// 手机底部导航占满宽度，记为 0
watchEffect(() => {
  const width = isCompact.value ? '0px' : '96px';
  document.documentElement.style.setProperty('--sidenav-width', width);
});
</script>
