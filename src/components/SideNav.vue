<template>
  <!-- 桌面：浮动圆角侧栏，可在「图标 + 文字」与折叠窄栏之间切换 -->
  <aside
    v-if="!isCompact"
    class="sidenav"
    :class="{ 'is-collapsed': collapsed }"
  >
    <div class="sidenav-head">
      <button
        type="button"
        class="sidenav-icon-btn"
        :title="collapsed ? '展开侧栏' : '折叠侧栏'"
        :aria-label="collapsed ? '展开侧栏' : '折叠侧栏'"
        :aria-expanded="!collapsed"
        @click="toggleSidebar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
          <path v-if="collapsed" d="M4 6h16M4 12h16M4 18h16" />
          <path v-else d="M4 7h13M4 12h9M4 17h13" />
        </svg>
      </button>

      <button
        type="button"
        class="sidenav-avatar"
        title="HOMURA · 返回主页"
        aria-label="HOMURA，返回主页"
        @click="select('shelf')"
      >
        <img :src="logoUrl" alt="" draggable="false" />
      </button>
    </div>

    <nav ref="desktopNavRef" class="sidenav-list" aria-label="主导航">
      <span
        class="sidenav-indicator"
        :class="{ 'is-ready': desktopReady }"
        :style="{ transform: `translate3d(0, ${desktopIndicatorY}px, 0)` }"
        aria-hidden="true"
      ></span>
      <button
        v-for="item in navItems"
        :key="item.key"
        type="button"
        class="sidenav-item"
        :class="{ 'is-active': active === item.key }"
        :title="item.label"
        :aria-current="active === item.key ? 'page' : undefined"
        @click="select(item.key)"
      >
        <svg
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          :class="{ 'is-star': item.key === 'favorite', 'is-gear': item.key === 'settings' }"
          aria-hidden="true"
        >
          <path
            v-if="item.key === 'shelf'"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.9"
            d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z"
          />
          <template v-else-if="item.key === 'recent'">
            <circle cx="12" cy="12" r="9" stroke-width="1.9" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="M12 7v5l3 2" />
          </template>
          <path
            v-else-if="item.key === 'favorite'"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.9"
            d="M12 17.3l5.4 3.2-1.4-6.1 4.7-4.1-6.2-.5L12 4l-2.5 5.8-6.2.5 4.7 4.1-1.4 6.1z"
          />
          <template v-else>
            <circle cx="12" cy="12" r="3" stroke-width="1.9" />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.9"
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
            />
          </template>
        </svg>
        <span class="sidenav-label sidenav-label-wide">{{ item.label }}</span>
        <span class="sidenav-label sidenav-label-compact" aria-hidden="true">{{ item.label }}</span>
      </button>
    </nav>

  </aside>

  <!-- 手机：悬浮胶囊底栏 -->
  <Teleport v-else to="#homura-mobile-nav-root">
    <nav ref="mobileNavRef" class="mobile-nav" aria-label="主导航">
      <span
        class="mobile-nav-indicator"
        :class="{ 'is-ready': mobileReady }"
        :style="{ transform: `translate3d(${mobileIndicator.x}px, ${mobileIndicator.y}px, 0)` }"
        aria-hidden="true"
      ></span>
      <button
        v-for="item in navItems"
        :key="item.key"
        type="button"
        class="mobile-nav-item"
        :class="{ 'is-active': active === item.key }"
        :title="item.label"
        :aria-current="active === item.key ? 'page' : undefined"
        @click="select(item.key)"
      >
        <svg
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          :class="{ 'is-star': item.key === 'favorite', 'is-gear': item.key === 'settings' }"
          aria-hidden="true"
        >
          <path
            v-if="item.key === 'shelf'"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.9"
            d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z"
          />
          <template v-else-if="item.key === 'recent'">
            <circle cx="12" cy="12" r="9" stroke-width="1.9" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="M12 7v5l3 2" />
          </template>
          <path
            v-else-if="item.key === 'favorite'"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.9"
            d="M12 17.3l5.4 3.2-1.4-6.1 4.7-4.1-6.2-.5L12 4l-2.5 5.8-6.2.5 4.7 4.1-1.4 6.1z"
          />
          <template v-else>
            <circle cx="12" cy="12" r="3" stroke-width="1.9" />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.9"
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
            />
          </template>
        </svg>
        <span>{{ item.label }}</span>
      </button>
    </nav>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useViewport } from '../composables/useViewport.js';

const SIDEBAR_STORAGE_KEY = 'homura_sidenav_collapsed';

const { isCompact } = useViewport();
const props = defineProps({
  active: { type: String, default: 'shelf' }
});
const emit = defineEmits(['nav']);

const logoUrl = import.meta.env.BASE_URL + 'splash-icon.png';

// 记住上次的展开/折叠选择，第一次使用默认展开。
function readCollapsed() {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch (e) {}
  return false;
}

const collapsed = ref(readCollapsed());

const desktopNavRef = ref(null);
const mobileNavRef = ref(null);
const desktopReady = ref(false);
const mobileReady = ref(false);
const desktopIndicatorY = ref(0);
const mobileIndicator = ref({ x: 0, y: 0 });

let measureFrame = 0;

function measureIndicators() {
  const desktopActive = desktopNavRef.value?.querySelector('.sidenav-item.is-active');
  if (desktopActive) {
    desktopIndicatorY.value = desktopActive.offsetTop;
    if (!desktopReady.value) {
      requestAnimationFrame(() => {
        desktopReady.value = true;
      });
    }
  }

  const mobileActive = mobileNavRef.value?.querySelector('.mobile-nav-item.is-active');
  if (mobileActive) {
    mobileIndicator.value = { x: mobileActive.offsetLeft, y: mobileActive.offsetTop };
    if (!mobileReady.value) {
      requestAnimationFrame(() => {
        mobileReady.value = true;
      });
    }
  }
}

function scheduleMeasure() {
  cancelAnimationFrame(measureFrame);
  measureFrame = requestAnimationFrame(measureIndicators);
}

function toggleSidebar() {
  collapsed.value = !collapsed.value;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed.value ? '1' : '0');
  } catch (e) {}
}

const navItems = [
  { key: 'shelf', label: '书架' },
  { key: 'recent', label: '最近' },
  { key: 'favorite', label: '收藏' },
  { key: 'settings', label: '设置' }
];

function select(key) {
  emit('nav', key);
}

watch(() => props.active, () => nextTick(measureIndicators));
watch(collapsed, () => nextTick(scheduleMeasure));
watch(isCompact, () => nextTick(scheduleMeasure));

onMounted(() => {
  measureIndicators();
  window.addEventListener('resize', scheduleMeasure);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleMeasure);
  cancelAnimationFrame(measureFrame);
});
</script>

<style scoped>
  /* ---------------- 桌面：浮动侧栏 ---------------- */
  .sidenav {
    position: sticky;
    top: 16px;
    z-index: 30;
    flex: 0 0 220px;
    width: 220px;
    margin: 16px;
    height: calc(100vh - 32px);
    height: calc(100dvh - 32px);
    padding: 12px;
    display: flex;
    flex-direction: column;
    border-radius: 28px;
    background: color-mix(in oklab, var(--md-primary-container) 18%, var(--md-surface-low));
    box-shadow:
      0 0 0 0.5px color-mix(in oklab, var(--md-primary) 12%, transparent),
      0 14px 34px -20px color-mix(in oklab, var(--md-on-surface) 55%, transparent);
    transition:
      flex-basis 280ms cubic-bezier(0.2, 0, 0, 1),
      width 280ms cubic-bezier(0.2, 0, 0, 1),
      padding 280ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sidenav.is-collapsed {
    flex-basis: 104px;
    width: 104px;
    padding: 12px 8px;
    align-items: center;
  }

  .sidenav-head {
    position: relative;
    flex: 0 0 auto;
    width: 100%;
    height: 68px;
    transition: height 280ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sidenav.is-collapsed .sidenav-head {
    height: 118px;
  }

  .sidenav-icon-btn,
  .sidenav-avatar {
    position: absolute;
    top: 4px;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: var(--md-on-surface);
    transition:
      background-color 200ms cubic-bezier(0.2, 0, 0, 1),
      transform 280ms cubic-bezier(0.2, 0, 0, 1),
      top 280ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sidenav-icon-btn {
    left: 6px;
  }

  .sidenav-avatar {
    left: calc(50% - 24px);
    width: 48px;
    height: 48px;
    border-radius: 16px;
  }

  .sidenav.is-collapsed .sidenav-icon-btn {
    transform: translateX(16px);
  }

  .sidenav.is-collapsed .sidenav-avatar {
    top: 62px;
  }

  .sidenav-icon-btn svg {
    width: 22px;
    height: 22px;
  }

  .sidenav-icon-btn:hover {
    background: color-mix(in oklab, var(--md-surface-low) 65%, transparent);
  }

  .sidenav-avatar {
    overflow: hidden;
  }

  .sidenav-avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .sidenav-list {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
  }

  .sidenav-indicator {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    width: 100%;
    height: 56px;
    border-radius: 30px;
    background: var(--md-primary-container);
    opacity: 0;
    pointer-events: none;
  }

  .sidenav-indicator.is-ready {
    opacity: 1;
    transition:
      transform 300ms cubic-bezier(0.2, 0, 0, 1),
      opacity 120ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sidenav-item {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 56px;
    border-radius: 30px;
    background: transparent;
    font-weight: 600;
    color: var(--md-on-surface);
    transition:
      background-color 200ms cubic-bezier(0.2, 0, 0, 1),
      color 200ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sidenav-item svg {
    position: absolute;
    top: calc(50% - 10px);
    left: 17px;
    width: 20px;
    height: 20px;
    transition:
      top 280ms cubic-bezier(0.2, 0, 0, 1),
      left 280ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sidenav-item svg.is-star {
    transform: scale(1.12);
    transform-origin: center;
  }

  .sidenav-item svg.is-gear {
    transform: scale(0.9);
    transform-origin: center;
  }

  .sidenav-label {
    position: absolute;
    line-height: 1.2;
    white-space: nowrap;
  }

  .sidenav-label-wide {
    top: 50%;
    left: 54px;
    transform: translateY(-50%);
    font-size: 15px;
    opacity: 1;
    transition: opacity 100ms cubic-bezier(0.2, 0, 0, 1) 40ms;
  }

  .sidenav-label-compact {
    top: 35px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    opacity: 0;
    transition: opacity 80ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sidenav.is-collapsed .sidenav-label-wide {
    opacity: 0;
    transition: opacity 80ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sidenav.is-collapsed .sidenav-label-compact {
    opacity: 1;
    transition: opacity 100ms cubic-bezier(0.2, 0, 0, 1) 40ms;
  }

  @media (hover: hover) and (pointer: fine) {
    .sidenav-item:hover {
      background: var(--md-surface-container);
    }
  }

  .sidenav-item.is-active {
    background: transparent;
    color: var(--md-on-primary-container);
  }

  .sidenav.is-collapsed .sidenav-item {
    height: 56px;
  }

  .sidenav.is-collapsed .sidenav-item svg {
    top: 9px;
    left: calc(50% - 10px);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidenav,
    .sidenav-head,
    .sidenav-icon-btn,
    .sidenav-avatar,
    .sidenav-indicator.is-ready,
    .sidenav-item,
    .sidenav-item svg,
    .sidenav-label-wide,
    .sidenav-label-compact {
      transition: none;
    }
  }

  /* ---------------- 手机：悬浮胶囊底栏 ---------------- */
  .mobile-nav {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: calc(14px + env(safe-area-inset-bottom));
    z-index: 40;
    height: 76px;
    max-width: 560px;
    margin-inline: auto;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    border-radius: 38px;
    background: color-mix(in oklab, var(--md-primary-container) 22%, var(--md-surface-container));
    box-shadow:
      0 0 0 0.5px color-mix(in oklab, var(--md-primary) 12%, transparent),
      0 18px 36px -16px color-mix(in oklab, var(--md-on-surface) 55%, transparent);
  }

  .mobile-nav-indicator {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    width: 60px;
    height: 56px;
    border-radius: 18px;
    background: var(--md-primary);
    opacity: 0;
    pointer-events: none;
  }

  .mobile-nav-indicator.is-ready {
    opacity: 1;
    transition:
      transform 300ms cubic-bezier(0.2, 0, 0, 1),
      opacity 120ms cubic-bezier(0.2, 0, 0, 1);
  }

  .mobile-nav-item {
    position: relative;
    z-index: 1;
    width: 60px;
    height: 56px;
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 11px;
    font-weight: 600;
    background: transparent;
    color: var(--md-on-surface-variant);
    transition:
      background-color 200ms cubic-bezier(0.2, 0, 0, 1),
      color 200ms cubic-bezier(0.2, 0, 0, 1);
  }

  .mobile-nav-item svg {
    width: 22px;
    height: 22px;
  }

  .mobile-nav-item svg.is-star {
    transform: scale(1.12);
    transform-origin: center;
  }

  .mobile-nav-item svg.is-gear {
    transform: scale(0.9);
    transform-origin: center;
  }

  .mobile-nav-item.is-active {
    background: transparent;
    color: var(--md-on-primary);
  }

  @media (prefers-reduced-motion: reduce) {
    .mobile-nav-indicator.is-ready,
    .mobile-nav-item {
      transition: none;
    }
  }
</style>
