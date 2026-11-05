<template>
  <!-- 书架页头部：MD3 Top App Bar + 搜索栏 + 筛选 chips -->
  <div
    class="library-header-bar z-20 bg-[var(--md-surface)]"
    :style="isCompact ? { paddingTop: 'env(safe-area-inset-top)' } : null"
  >
    <!-- Top App Bar: 桌面 64px / 手机 56px -->
    <div class="h-14 min-[900px]:h-16 flex items-center gap-2 min-[900px]:gap-3 px-4 min-[900px]:px-7">
      <Transition name="library-title" mode="out-in" appear @enter="onTitleEnter">
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
          <MdIcon name="edit" class="w-3.5 h-3.5 shrink-0 text-[var(--md-on-surface-variant)] opacity-50 group-hover:opacity-80 transition-opacity duration-200" />
        </button>
        <h1 v-else :key="title" class="text-[21px] min-[900px]:text-[22px] font-medium tracking-tight min-w-0 truncate">{{ title }}</h1>
      </Transition>
      <span ref="countBadgeRef" class="hidden min-[360px]:inline-flex shrink-0 px-2.5 py-1 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] font-mono text-[10px] min-[900px]:text-[12px] font-semibold">{{ count }} 部作品</span>

      <div class="ml-auto flex items-center gap-0.5 min-[900px]:gap-2 shrink-0">
        <button
          v-if="settings.showFullscreenButton"
          @click="ui.toggleFullscreen()"
          class="hidden min-[900px]:grid w-11 h-11 rounded-full place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
          :title="ui.fullscreen ? '退出全屏 (F)' : '全屏 (F)'"
          :aria-label="ui.fullscreen ? '退出全屏 (F)' : '全屏 (F)'"
          :aria-pressed="ui.fullscreen"
        >
          <MdIcon :name="ui.fullscreen ? 'fullscreen_exit' : 'fullscreen'" class="w-5 h-5" />
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
          <MdIcon name="palette" class="w-5 h-5" />
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
            <MdIcon name="sort" class="w-5 h-5" />
          </button>
          <div v-if="menu === 'sort'" class="fixed inset-0 z-20" @click="menu = null"></div>
          <div
            v-if="menu === 'sort'"
            class="absolute right-0 top-full mt-2 w-60 z-30 md-menu"
            role="menu"
            aria-label="排序方式"
          >
            <p role="presentation" class="md-menu-label">排序方式</p>
            <button
              v-for="opt in sortOptions"
              :key="opt.value"
              type="button"
              role="menuitemradio"
              :aria-checked="sort === opt.value"
              @click="pickSort(opt.value)"
              class="md-menu-item"
            >
              <span class="flex-1">{{ opt.label }}</span>
              <MdIcon v-if="sort === opt.value" name="check" class="md-menu-check" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 搜索栏：手机独立一行；桌面嵌入 Top App Bar 中段，避免被拉成整条跑道 -->
    <div class="library-search-slot px-4 pt-2 min-[900px]:absolute min-[900px]:left-1/2 min-[900px]:top-1 min-[900px]:z-10 min-[900px]:w-[min(440px,38vw)] min-[900px]:-translate-x-1/2 min-[900px]:p-0">
      <div class="library-search-field h-14 rounded-[28px] bg-[var(--md-surface-high)] flex items-center gap-3 pl-4 pr-2 transition-colors duration-200">
        <MdIcon name="search" class="w-6 h-6 shrink-0 text-[var(--md-on-surface-variant)]" />
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
          type="button"
          @click="$emit('update:query', '')"
          class="md-hit-target w-10 h-10 shrink-0 rounded-full grid place-items-center text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-container)] transition-colors"
          title="清空搜索"
          aria-label="清空搜索"
        >
          <MdIcon name="close" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 筛选 chips：类型直接切换，文件格式收进一个下拉菜单 -->
    <div class="relative px-4 min-[900px]:px-7 pt-1 pb-0 flex items-center gap-2">
      <div class="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          v-for="t in types"
          :key="t.value"
          type="button"
          @click="$emit('update:type', t.value)"
          class="md-filter-chip shrink-0"
          :class="{ 'is-selected': type === t.value }"
          :aria-pressed="type === t.value"
        >
          <MdIcon v-if="type === t.value" name="check" />
          <span>{{ t.label }}</span>
        </button>
      </div>

      <button
        type="button"
        @click="toggleMenu('format')"
        class="md-filter-chip shrink-0"
        :class="{ 'is-selected': !!activeFormat }"
        :title="activeFormat ? `文件格式：${activeFormat.label}` : '按文件格式筛选'"
        aria-haspopup="menu"
        :aria-expanded="menu === 'format'"
      >
        <MdIcon v-if="activeFormat" name="check" />
        <span>{{ activeFormat ? activeFormat.label : '格式' }}</span>
        <MdIcon
          name="expand_more"
          class="library-format-chevron transition-transform duration-200"
          :class="menu === 'format' ? 'rotate-180' : ''"
        />
      </button>

      <div v-if="menu === 'format'" class="fixed inset-0 z-20" @click="menu = null"></div>
      <div
        v-if="menu === 'format'"
        class="absolute right-4 min-[900px]:right-7 top-full mt-2 w-48 z-30 md-menu"
        role="menu"
        aria-label="文件格式"
      >
        <p role="presentation" class="md-menu-label">文件格式</p>
        <button
          v-for="opt in formatOptions"
          :key="opt.value"
          type="button"
          role="menuitemradio"
          :aria-checked="type === opt.value"
          @click="pickType(opt.value)"
          class="md-menu-item"
        >
          <span class="flex-1">{{ opt.label }}</span>
          <MdIcon v-if="type === opt.value" name="check" class="md-menu-check" />
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
import MdIcon from './MdIcon.vue';

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

.library-format-chevron {
  width: 16px;
  height: 16px;
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
