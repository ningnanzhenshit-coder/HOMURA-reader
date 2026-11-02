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

</template>

<script setup>
import { useViewport } from '../composables/useViewport.js';

const { isCompact } = useViewport();
defineProps({
  active: { type: String, default: 'shelf' }
});
const emit = defineEmits(['nav']);

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
  emit('nav', key);
}
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
