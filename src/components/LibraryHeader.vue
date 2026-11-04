<template>
  <!-- 书架页头部：MD3 Top App Bar + 搜索栏 + 筛选 chips -->
  <div
    class="library-header-bar z-20 bg-[var(--md-surface)]"
    :style="isCompact ? { paddingTop: 'env(safe-area-inset-top)' } : null"
  >
    <!-- Top App Bar: 桌面 64px / 手机 56px -->
    <div class="h-14 min-[900px]:h-16 flex items-center gap-2 min-[900px]:gap-3 px-4 min-[900px]:px-7">
      <Transition name="library-title" mode="out-in" @enter="onTitleEnter">
        <button
          v-if="renamable"
          :key="title"
          type="button"
          class="group flex items-center gap-1.5 min-w-0 text-left text-[21px] min-[900px]:text-[22px] font-medium tracking-tight"
          title="重命名书库"
          :aria-label="`重命名书库：${title}`"
          @click="$emit('rename')"
        >
          <span class="min-w-0 truncate">{{ title }}</span>
          <svg class="w-3.5 h-3.5 shrink-0 text-[var(--md-on-surface-variant)] opacity-50 group-hover:opacity-80 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z"/>
          </svg>
        </button>
        <h1 v-else :key="title" class="text-[21px] min-[900px]:text-[22px] font-medium tracking-tight min-w-0 truncate">{{ title }}</h1>
      </Transition>
      <span ref="countBadgeRef" class="hidden min-[360px]:inline-flex shrink-0 px-[9px] py-1 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] font-mono text-[10px] min-[900px]:text-[12px] font-semibold">{{ count }} 部作品</span>

      <div class="ml-auto flex items-center gap-0.5 min-[900px]:gap-2 shrink-0">
        <button
          v-if="settings.showFullscreenButton"
          @click="ui.toggleFullscreen()"
          class="hidden min-[900px]:grid w-11 h-11 rounded-full place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
          :title="ui.fullscreen ? '退出全屏 (F)' : '全屏 (F)'"
          :aria-label="ui.fullscreen ? '退出全屏 (F)' : '全屏 (F)'"
          :aria-pressed="ui.fullscreen"
        >
          <svg v-if="ui.fullscreen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 4v5H4"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4v5h5"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 20v-5h5"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20v-5H4"/>
          </svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 9V4h5"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 4h5v5"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 15v5h-5"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20H4v-5"/>
          </svg>
        </button>
        <button
          @click="toggleAppearance"
          class="w-11 h-11 rounded-full grid place-items-center transition-colors"
          :class="appearanceOpen
            ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]'
            : 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)]'"
          title="外观设置"
          aria-label="外观设置"
          aria-haspopup="dialog"
          :aria-expanded="appearanceOpen"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a9 9 0 100 18h1.5a2.5 2.5 0 000-5H12a2 2 0 010-4h4a4 4 0 004-4 5 5 0 00-5-5h-3z"/>
          </svg>
        </button>

        <slot name="actions" />
        <div class="relative">
          <button
            @click="toggleMenu('sort')"
            class="md-hit-target w-11 h-11 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors"
            title="排序方式"
            aria-label="排序方式"
            aria-haspopup="menu"
            :aria-expanded="menu === 'sort'"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h6"/>
            </svg>
          </button>
          <div v-if="menu === 'sort'" class="fixed inset-0 z-20" @click="menu = null"></div>
          <div
            v-if="menu === 'sort'"
            class="absolute right-0 top-full mt-1 w-56 z-30 rounded-2xl bg-[var(--md-surface-container)] shadow-xl p-1.5 flex flex-col gap-0.5"
            role="menu"
            aria-label="排序方式"
          >
            <p role="presentation" class="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-[var(--md-on-surface-variant)]">排序方式</p>
            <button
              v-for="opt in sortOptions"
              :key="opt.value"
              role="menuitemradio"
              :aria-checked="sort === opt.value"
              @click="pickSort(opt.value)"
              class="md-mobile-menu-item w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-xs font-semibold text-left transition-colors"
              :class="sort === opt.value ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]' : 'hover:bg-[var(--md-surface-high)]'"
            >
              <span class="flex-1">{{ opt.label }}</span>
              <svg v-if="sort === opt.value" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 12l5 5L20 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 搜索栏：手机独立一行；桌面嵌入 Top App Bar 中段，避免被拉成整条跑道 -->
    <div class="library-search-slot px-4 pt-1.5 min-[900px]:absolute min-[900px]:left-1/2 min-[900px]:top-3 min-[900px]:z-10 min-[900px]:w-[min(440px,38vw)] min-[900px]:-translate-x-1/2 min-[900px]:p-0">
      <div class="library-search-field h-[52px] min-[900px]:h-10 rounded-[26px] min-[900px]:rounded-[20px] bg-[var(--md-surface-high)] flex items-center gap-3 pl-[18px] min-[900px]:pl-4 pr-4 min-[900px]:pr-2.5 transition-colors duration-200">
        <svg class="w-5 h-5 shrink-0 text-[var(--md-on-surface-variant)] opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" stroke-width="2"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 20l-4-4"/>
        </svg>
        <input
          :value="query"
          @input="$emit('update:query', $event.target.value)"
          @keydown.enter.prevent="$event.target.blur()"
          type="search"
          inputmode="search"
          enterkeyhint="search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="搜索书名、作者"
          placeholder="搜索书名、作者…"
          class="library-search-input flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] font-medium text-[var(--md-on-surface)] placeholder:text-[var(--md-on-surface-variant)]"
        />
        <button
          v-if="query"
          @click="$emit('update:query', '')"
          class="md-hit-target w-9 h-9 -mr-1.5 shrink-0 rounded-full grid place-items-center text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-container)] transition-colors"
          title="清空搜索"
          aria-label="清空搜索"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 筛选 chips：类型直接切换，文件格式收进一个下拉菜单 -->
    <div class="relative px-4 min-[900px]:px-7 pt-3.5 min-[900px]:pt-3 pb-1 flex items-center gap-2">
      <div class="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          v-for="t in types"
          :key="t.value"
          @click="$emit('update:type', t.value)"
          class="library-filter-chip h-11 min-[900px]:h-8 shrink-0 px-[13px] rounded-lg text-[11.5px] min-[900px]:text-[12px] font-medium inline-flex items-center"
          :class="[
            type === t.value
              ? 'is-selected text-[var(--md-on-secondary-container)]'
              : 'text-[var(--md-on-surface)]',
            { 'is-pushed': isPushedFilter(t.value) }
          ]"
          :aria-pressed="type === t.value"
        >
          <span class="library-filter-surface" aria-hidden="true"></span>
          <span class="library-filter-fill" aria-hidden="true"></span>
          <span
            class="library-filter-check"
            :class="{ 'is-visible': type === t.value }"
            aria-hidden="true"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 12l5 5L20 7"/>
            </svg>
          </span>
          <span class="library-filter-label">{{ t.label }}</span>
        </button>
      </div>

      <button
        @click="toggleMenu('format')"
        class="h-11 min-[900px]:h-8 shrink-0 pl-[13px] pr-2.5 rounded-lg text-[11.5px] min-[900px]:text-[12px] font-medium inline-flex items-center gap-1.5 border-[0.5px] border-[var(--md-outline-variant)] transition-colors duration-200"
        :class="activeFormat
          ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] border-transparent'
          : 'border-[var(--md-outline-variant)] text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)]'"
        :title="activeFormat ? `文件格式：${activeFormat.label}` : '按文件格式筛选'"
        aria-haspopup="menu"
        :aria-expanded="menu === 'format'"
      >
        <svg v-if="activeFormat" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 12l5 5L20 7"/>
        </svg>
        {{ activeFormat ? activeFormat.label : '格式' }}
        <svg
          class="w-3.5 h-3.5 transition-transform duration-200"
          :class="menu === 'format' ? 'rotate-180' : ''"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      <div v-if="menu === 'format'" class="fixed inset-0 z-20" @click="menu = null"></div>
      <div
        v-if="menu === 'format'"
        class="absolute right-4 min-[900px]:right-7 top-full mt-1 w-44 z-30 rounded-2xl bg-[var(--md-surface-container)] shadow-xl p-1.5 flex flex-col gap-0.5"
        role="menu"
        aria-label="文件格式"
      >
        <button
          v-for="opt in formatOptions"
          :key="opt.value"
          role="menuitemradio"
          :aria-checked="type === opt.value"
          @click="pickType(opt.value)"
          class="md-mobile-menu-item w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-xs font-semibold text-left transition-colors"
          :class="type === opt.value ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]' : 'hover:bg-[var(--md-surface-high)]'"
        >
          <span class="flex-1">{{ opt.label }}</span>
          <svg v-if="type === opt.value" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 12l5 5L20 7"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, shallowRef, onBeforeUnmount } from 'vue';
import { useSettingsStore } from '../stores/settings.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';

const props = defineProps({
  title: { type: String, default: '书架' },
  count: { type: Number, default: 0 },
  appearanceOpen: { type: Boolean, default: false },
  query: { type: String, default: '' },
  type: { type: String, default: 'all' },
  sort: { type: String, default: 'title' },
  renamable: { type: Boolean, default: false }
});

const emit = defineEmits(['update:query', 'update:type', 'update:sort', 'toggle-appearance', 'rename']);

const settings = useSettingsStore();
const ui = useUiStore();
const { isCompact } = useViewport();

const menu = ref(null);
const countBadgeRef = shallowRef(null);
let previousBadgeLeft = null;
let badgeAnimation = null;

// 标题变化前记录徽章位置；新标题进场时用 FLIP 补间，制造被文字推动的效果。
watch(() => props.title, () => {
  const badge = countBadgeRef.value;
  if (!badge) {
    previousBadgeLeft = null;
    return;
  }
  const rect = badge.getBoundingClientRect();
  previousBadgeLeft = rect.width > 0 ? rect.left : null;
});

function onTitleEnter() {
  const badge = countBadgeRef.value;
  const oldLeft = previousBadgeLeft;
  previousBadgeLeft = null;
  if (!badge || oldLeft === null) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  badgeAnimation?.cancel();
  badgeAnimation = null;
  const newLeft = badge.getBoundingClientRect().left;
  const offset = oldLeft - newLeft;
  if (Math.abs(offset) < 0.5) return;

  badgeAnimation = badge.animate(
    [
      { transform: `translate3d(${offset}px, 0, 0)` },
      { transform: 'translate3d(0, 0, 0)' }
    ],
    { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
  );
  badgeAnimation.onfinish = () => { badgeAnimation = null; };
}

onBeforeUnmount(() => {
  badgeAnimation?.cancel();
  badgeAnimation = null;
});

function toggleMenu(name) {
  menu.value = menu.value === name ? null : name;
}

// 外观浮层与排序菜单互斥，避免两个浮层叠在一起
function toggleAppearance() {
  menu.value = null;
  emit('toggle-appearance');
}

watch(isCompact, value => {
  if (!value) menu.value = null;
});
watch(() => props.appearanceOpen, value => {
  if (value) menu.value = null;
});

const types = [
  { value: 'all', label: '全部' },
  { value: 'manga', label: '漫画' },
  { value: 'novel', label: '轻小说' },
  { value: 'other', label: '其他' }
];

function isPushedFilter(value) {
  const selectedIndex = types.findIndex(type => type.value === props.type);
  const chipIndex = types.findIndex(type => type.value === value);
  return selectedIndex >= 0 && chipIndex > selectedIndex;
}

const formatOptions = [
  { value: 'all', label: '不限格式' },
  { value: 'epub', label: 'EPUB' },
  { value: 'pdf', label: 'PDF' },
  { value: 'mobi', label: 'MOBI' },
  { value: 'txt', label: 'TXT' },
  { value: 'markdown', label: 'Markdown' }
];

const activeFormat = computed(() => formatOptions.find(opt => opt.value !== 'all' && opt.value === props.type) || null);

function pickType(value) {
  emit('update:type', value);
  menu.value = null;
}

const sortOptions = [
  { value: 'title', label: '书名 · 数字 / 字母 / 拼音' },
  { value: 'recent', label: '最近添加' },
  { value: 'progress', label: '阅读进度' }
];

function pickSort(value) {
  emit('update:sort', value);
  menu.value = null;
}

</script>

<style scoped>
.library-header-bar {
  position: sticky;
  top: 0;
}

/* 手机书架改为内部滚动后，顶栏留在固定外壳的文档流里，不再跟随窗口滚动 */
@media (max-width: 899px) {
  .library-header-bar {
    position: relative;
    flex: 0 0 auto;
  }
}

/* 900–1079px 展开侧栏会压缩顶栏中段，搜索框改为独立一行，避免与标题和右侧按钮重叠 */
@media (min-width: 900px) and (max-width: 1079px) {
  .library-search-slot {
    position: static;
    width: auto;
    transform: none;
    padding: 2px 28px 10px;
  }
}

.library-filter-chip {
  --filter-check-space: 20px;
  position: relative;
  isolation: isolate;
  border: 0;
  background: transparent;
  transition:
    color var(--md-duration-short) var(--md-ease-emphasized),
    transform var(--md-duration-short) var(--md-ease-emphasized);
}

.library-filter-chip.is-pushed {
  transform: translate3d(var(--filter-check-space), 0, 0);
}

.library-filter-chip:focus-visible {
  outline: 2px solid var(--md-primary);
  outline-offset: 2px;
}

.library-filter-surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background-color: transparent;
  box-shadow: inset 0 0 0 0.5px var(--md-outline-variant);
  pointer-events: none;
  transition:
    background-color var(--md-duration-short) var(--md-ease-emphasized),
    box-shadow var(--md-duration-short) var(--md-ease-emphasized);
}

.library-filter-chip.is-selected .library-filter-surface {
  box-shadow: inset 0 0 0 0.5px transparent;
}

.library-filter-fill {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 0;
  width: calc(100% + var(--filter-check-space));
  border-radius: inherit;
  background-color: var(--md-secondary-container);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--md-duration-short) var(--md-ease-emphasized);
}

.library-filter-chip.is-selected .library-filter-fill {
  opacity: 1;
}

.library-filter-check {
  position: absolute;
  top: 50%;
  left: 13px;
  z-index: 1;
  display: block;
  width: 14px;
  height: 14px;
  overflow: hidden;
  opacity: 0;
  transform: translate3d(-4px, -50%, 0) scale(0.8);
  transition:
    opacity var(--md-duration-short) var(--md-ease-emphasized),
    transform var(--md-duration-short) var(--md-ease-emphasized);
}

.library-filter-check.is-visible {
  opacity: 1;
  transform: translate3d(0, -50%, 0) scale(1);
}

.library-filter-check svg {
  display: block;
  width: 14px;
  height: 14px;
}

.library-filter-label {
  position: relative;
  z-index: 1;
  transition: transform var(--md-duration-short) var(--md-ease-emphasized);
}

.library-filter-chip.is-selected .library-filter-label {
  transform: translate3d(var(--filter-check-space), 0, 0);
}

@media (hover: hover) and (pointer: fine) {
  .library-filter-chip:not(.is-selected):hover .library-filter-surface {
    background-color: var(--md-surface-container);
    box-shadow:
      inset 0 0 0 0.5px var(--md-outline-variant),
      var(--md-elevation-hover);
  }

  .library-filter-chip.is-selected:hover .library-filter-surface {
    box-shadow:
      inset 0 0 0 0.5px transparent,
      var(--md-elevation-hover);
  }
}

.library-title-enter-active {
  transition:
    opacity 180ms var(--md-ease-emphasized),
    transform 180ms var(--md-ease-emphasized);
}
.library-title-leave-active {
  transition:
    opacity 120ms var(--md-ease-emphasized),
    transform 120ms var(--md-ease-emphasized);
}
.library-title-enter-from {
  opacity: 0;
  transform: translate3d(-12px, 0, 0);
}
.library-title-leave-to {
  opacity: 0;
  transform: translate3d(12px, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .library-filter-chip,
  .library-filter-surface,
  .library-filter-fill,
  .library-filter-check,
  .library-filter-label,
  .library-title-enter-active,
  .library-title-leave-active {
    transition: none;
  }
  .library-title-enter-from,
  .library-title-leave-to {
    transform: none;
  }
}
</style>
