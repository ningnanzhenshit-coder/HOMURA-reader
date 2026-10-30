<template>
  <!-- 书架页头部：MD3 Top App Bar + 搜索栏 + 筛选 chips -->
  <div
    class="sticky top-0 z-20 bg-[var(--md-surface)]"
    :style="isCompact ? { paddingTop: 'env(safe-area-inset-top)' } : null"
  >
    <!-- Top App Bar: 桌面 64px / 手机 56px -->
    <div class="h-14 min-[900px]:h-16 flex items-center gap-3 px-4 min-[900px]:px-7">
      <h1 class="text-[21px] min-[900px]:text-[22px] font-medium tracking-tight shrink-0">书架</h1>
      <span class="shrink-0 px-[9px] py-1 rounded-full bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] font-mono text-[9px] font-semibold">{{ count }} 部作品</span>

      <div class="ml-auto flex items-center gap-2 shrink-0">
        <div class="relative">
          <button @click="toggleMenu('sort')" class="md-hit-target w-11 h-11 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors" title="排序方式" aria-label="排序方式">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h6"/>
            </svg>
          </button>
          <div v-if="menu === 'sort'" class="fixed inset-0 z-20" @click="menu = null"></div>
          <div
            v-if="menu === 'sort'"
            class="absolute right-0 top-full mt-1 w-44 z-30 rounded-2xl bg-[var(--md-surface-container)] shadow-xl p-1.5 flex flex-col gap-0.5"
          >
            <button
              v-for="opt in sortOptions"
              :key="opt.value"
              @click="pickSort(opt.value)"
              class="md-mobile-menu-item w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-colors"
              :class="sort === opt.value ? 'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]' : 'hover:bg-[var(--md-surface-high)]'"
            >
              <span class="flex-1">{{ opt.label }}</span>
              <svg v-if="sort === opt.value" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 12l5 5L20 7"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="relative">
          <button
            @click="toggleMenu('more')"
            class="w-11 h-11 rounded-full grid place-items-center bg-[var(--md-tertiary-container)] text-[var(--md-on-tertiary-container)] text-[11px] font-bold"
            title="更多操作"
            aria-label="更多操作"
          >H</button>
          <div v-if="menu === 'more'" class="fixed inset-0 z-20" @click="menu = null"></div>
          <div
            v-if="menu === 'more'"
            class="absolute right-0 top-full mt-1 w-48 z-30 rounded-2xl bg-[var(--md-surface-container)] shadow-xl p-1.5 flex flex-col gap-0.5"
          >
            <button @click="addDemoManga" class="md-mobile-menu-item w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-[var(--md-surface-high)] transition-colors">+ 示例漫画</button>
            <button @click="addDemoNovel" class="md-mobile-menu-item w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-[var(--md-surface-high)] transition-colors">+ 示例小说</button>
            <div v-if="storageLabel" class="px-3 py-2 font-mono text-[11px] text-[var(--md-on-surface-variant)] border-t border-[var(--md-outline-variant)]">
              存储 {{ storageLabel }}
            </div>
            <button @click="onClear" class="md-mobile-menu-item w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold text-[var(--md-primary)] hover:bg-[var(--md-surface-high)] transition-colors">清空书架</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 搜索栏 52px 胶囊 -->
    <div class="px-4 min-[900px]:px-7 pt-1.5">
      <div class="h-[52px] rounded-[26px] bg-[var(--md-surface-high)] flex items-center gap-3 pl-[18px] pr-4">
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
          class="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] font-medium text-[var(--md-on-surface)] placeholder:text-[var(--md-on-surface-variant)]"
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
    <div class="relative px-4 min-[900px]:px-7 pt-3.5 pb-1 flex items-center gap-2">
      <div class="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          v-for="t in types"
          :key="t.value"
          @click="$emit('update:type', t.value)"
          class="h-11 min-[900px]:h-8 shrink-0 px-[13px] rounded-lg text-[11.5px] font-medium inline-flex items-center gap-1.5 border transition-colors duration-200"
          :class="type === t.value
            ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)] border-transparent'
            : 'border-[var(--md-outline-variant)] text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)]'"
          :aria-pressed="type === t.value"
        >
          <svg v-if="type === t.value" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 12l5 5L20 7"/>
          </svg>
          {{ t.label }}
        </button>
      </div>

      <button
        @click="toggleMenu('format')"
        class="h-11 min-[900px]:h-8 shrink-0 pl-[13px] pr-2.5 rounded-lg text-[11.5px] font-medium inline-flex items-center gap-1.5 border transition-colors duration-200"
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
          class="md-mobile-menu-item w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-colors"
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
import { ref, computed, watch, onMounted } from 'vue';
import { useShelfStore } from '../stores/shelf.js';
import { useViewport } from '../composables/useViewport.js';
import { createDemoManga, createDemoNovel } from '../services/demo.js';
import { HomuraStore } from '../services/storage.js';
import { formatBytes } from '../services/platform.js';
import { showToast } from '../composables/useToast.js';

const props = defineProps({
  count: { type: Number, default: 0 },
  query: { type: String, default: '' },
  type: { type: String, default: 'all' },
  sort: { type: String, default: 'recent' }
});

const emit = defineEmits(['update:query', 'update:type', 'update:sort']);

const shelf = useShelfStore();
const { isCompact } = useViewport();

const menu = ref(null);

function toggleMenu(name) {
  menu.value = menu.value === name ? null : name;
}

// 存储用量：浏览器估算值，书架增减后刷新
const storage = ref(null);
const storageLabel = computed(() => {
  if (!storage.value || !storage.value.quota) return '';
  return `${formatBytes(storage.value.usage)} / ${formatBytes(storage.value.quota)}`;
});

async function refreshStorage() {
  storage.value = await HomuraStore.estimateStorage();
}

onMounted(refreshStorage);
watch(() => props.count, refreshStorage);
watch(isCompact, value => {
  if (!value) menu.value = null;
});

const types = [
  { value: 'all', label: '全部' },
  { value: 'manga', label: '漫画' },
  { value: 'novel', label: '轻小说' }
];

const formatOptions = [
  { value: 'all', label: '不限格式' },
  { value: 'epub', label: 'EPUB' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'mobi', label: 'MOBI' },
  { value: 'pdf', label: 'PDF' }
];

const activeFormat = computed(() => formatOptions.find(opt => opt.value !== 'all' && opt.value === props.type) || null);

function pickType(value) {
  emit('update:type', value);
  menu.value = null;
}

const sortOptions = [
  { value: 'recent', label: '最近添加' },
  { value: 'progress', label: '阅读进度' },
  { value: 'title', label: '书名排序' }
];

function pickSort(value) {
  emit('update:sort', value);
  menu.value = null;
}

function addDemoManga() {
  shelf.unshiftBook(createDemoManga());
  menu.value = null;
  showToast('已添加《示例漫画》到书架');
}

function addDemoNovel() {
  shelf.unshiftBook(createDemoNovel());
  menu.value = null;
  showToast('已添加《示例轻小说》到书架');
}

function onClear() {
  menu.value = null;
  shelf.clearShelf();
}
</script>
