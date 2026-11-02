<template>
  <!-- 桌面：MD3 Navigation Rail（96px，图标在上标签在下） -->
  <aside
    v-if="!isCompact"
    class="shrink-0 sticky top-0 h-screen w-24 z-30 flex flex-col items-center pt-3.5 pb-4 bg-[var(--md-surface-low)] border-r-[0.5px] border-[var(--md-outline-variant)]"
  >
    <button
      type="button"
      class="rail-logo shrink-0 mb-[22px]"
      title="HOMURA · 返回主页"
      aria-label="HOMURA，返回主页"
      @click="select('shelf')"
    >
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M9 8v16M23 8v16M9 16h14"
          stroke="currentColor"
          stroke-width="3.2"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <nav class="flex flex-col items-center gap-1.5 w-full">
      <button
        v-for="item in railItems"
        :key="item.key"
        @click="select(item.key)"
        class="w-full flex flex-col items-center gap-1 cursor-pointer group"
        :title="item.label"
        :aria-current="active === item.key ? 'page' : undefined"
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
              <circle cx="12" cy="12" r="3" stroke-width="2"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </template>
          </svg>
        </span>
        <em
          class="not-italic text-[12px] font-semibold transition-colors duration-200"
          :class="active === item.key ? 'text-[var(--md-on-primary-container)]' : 'text-[var(--md-on-surface-variant)]'"
        >{{ item.label }}</em>
      </button>
    </nav>

    <!-- 底部固定：外观快捷面板 -->
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
        <em class="not-italic text-[12px] font-semibold" :class="appearanceOpen ? 'text-[var(--md-on-primary-container)]' : 'text-[var(--md-on-surface-variant)]'">外观</em>
      </button>
    </div>
  </aside>

  <!-- 手机：MD3 Bottom Navigation -->
  <Teleport v-else to="#homura-mobile-nav-root">
    <nav
      class="fixed inset-x-0 bottom-0 z-40 flex items-center px-1.5 pt-1.5 bg-[var(--md-surface-container)] border-t-[0.5px] border-[var(--md-outline-variant)]"
      style="height: calc(5rem + env(safe-area-inset-bottom)); padding-bottom: calc(0.625rem + env(safe-area-inset-bottom));"
    >
      <button
        v-for="item in bottomItems"
        :key="item.key"
        @click="select(item.key)"
        class="nav-button flex-1 flex flex-col items-center gap-0.5 font-semibold text-[12px]"
        :class="active === item.key ? 'text-[var(--md-on-primary-container)]' : 'text-[var(--md-on-surface-variant)]'"
        :title="item.label"
        :aria-current="active === item.key ? 'page' : undefined"
      >
        <span
          class="nav-capsule w-[52px] h-[30px] rounded-[15px] grid place-items-center"
          :class="{ 'is-active': active === item.key }"
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
              <circle cx="12" cy="12" r="3" stroke-width="2"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </template>
          </svg>
        </span>
        <span>{{ item.label }}</span>
      </button>
    </nav>
  </Teleport>

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
      ref="appearanceSheetRef"
      class="fixed z-50 bg-[var(--md-surface-container)] shadow-2xl"
      :class="isCompact
        ? 'inset-x-0 bottom-0 max-h-[78dvh] overflow-y-auto overscroll-contain rounded-t-[28px] px-5 pt-2.5'
        : 'left-[104px] bottom-24 w-[280px] rounded-[20px] p-4'"
      :style="isCompact ? 'padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));' : null"
    >
      <div
        v-if="isCompact"
        class="mobile-sheet-drag-zone -mx-5 -mt-2.5 h-9 flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing"
        @pointerdown="onSheetDragStart"
        @pointermove="onSheetDragMove"
        @pointerup="onSheetDragEnd"
        @pointercancel="onSheetDragCancel"
      >
        <div class="w-8 h-1 rounded-full bg-[var(--md-outline-variant)]"></div>
      </div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-[17px] font-semibold">外观设置</h3>
        <button
          @click="appearanceOpen = false"
          class="md-hit-target w-10 h-10 -mr-1 rounded-full grid place-items-center text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-high)] transition-colors"
          title="关闭"
          aria-label="关闭外观设置"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <AppearancePanel />
    </div>
  </Transition>
</template>

<script setup>
import { computed, watch, onBeforeUnmount } from 'vue';
import { useViewport } from '../composables/useViewport.js';
import { useSheetDrag } from '../composables/useSheetDrag.js';
import AppearancePanel from './AppearancePanel.vue';

const { isCompact } = useViewport();
const props = defineProps({
  active: { type: String, default: 'shelf' },
  appearanceOpen: { type: Boolean, default: false }
});
const emit = defineEmits(['nav', 'update:appearanceOpen']);

const appearanceOpen = computed({
  get: () => props.appearanceOpen,
  set: value => emit('update:appearanceOpen', value)
});
const {
  sheetRef: appearanceSheetRef,
  onDragStart: onSheetDragStart,
  onDragMove: onSheetDragMove,
  onDragEnd: onSheetDragEnd,
  onDragCancel: onSheetDragCancel
} = useSheetDrag({
  isCompact,
  isOpen: appearanceOpen,
  onClose: () => {
    appearanceOpen.value = false;
  }
});

// 手机 Sheet 打开时锁住书架滚动，关闭后恢复到原位置。
let shelfScrollY = 0;
let shelfScrollLocked = false;

function lockShelfScroll() {
  if (shelfScrollLocked) return;
  shelfScrollY = window.scrollY || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${shelfScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
  shelfScrollLocked = true;
}

function unlockShelfScroll() {
  if (!shelfScrollLocked) return;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  window.scrollTo(0, shelfScrollY);
  shelfScrollLocked = false;
}

const railItems = [
  { key: 'shelf', label: '书架' },
  { key: 'recent', label: '最近' },
  { key: 'favorite', label: '收藏' },
  { key: 'settings', label: '设置' }
];

const bottomItems = [
  { key: 'shelf', label: '书架' },
  { key: 'recent', label: '最近' },
  { key: 'favorite', label: '收藏' },
  { key: 'settings', label: '设置' }
];

function select(key) {
  appearanceOpen.value = false;
  emit('nav', key);
}

watch([appearanceOpen, isCompact], ([open, compact]) => {
  if (open && compact) lockShelfScroll();
  else unlockShelfScroll();
});

onBeforeUnmount(unlockShelfScroll);
</script>

<style scoped>
  .nav-button {
    -webkit-tap-highlight-color: transparent;
    transition: color 200ms cubic-bezier(.2, 0, 0, 1);
  }

  .rail-logo {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: var(--md-on-primary-container);
    background: var(--md-primary-container);
    user-select: none;
  }

  .rail-logo svg {
    width: 31px;
    height: 31px;
  }

  .nav-capsule {
    position: relative;
    isolation: isolate;
  }

  .nav-capsule::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--md-primary-container);
    opacity: 0;
    transform: scale(.42);
    transition:
      transform 200ms cubic-bezier(.2, 0, 0, 1),
      opacity 200ms cubic-bezier(.2, 0, 0, 1);
  }

  .nav-capsule.is-active::before {
    opacity: 1;
    transform: scale(1);
  }

  .nav-capsule svg {
    position: relative;
    z-index: 1;
    transform-origin: center;
  }

  .nav-capsule.is-active svg {
    animation: nav-icon-settle 200ms cubic-bezier(.2, 0, 0, 1);
  }

  @keyframes nav-icon-settle {
    0% { transform: translateY(2px) scale(.8); }
    58% { transform: translateY(-1px) scale(1.1); }
    100% { transform: translateY(0) scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-button,
    .nav-capsule::before {
      transition: none;
    }

    .nav-capsule.is-active svg {
      animation: none;
    }
  }
</style>
