<template>
  <!-- 书架页头部：标题 / 搜索 / 筛选 / 排序 / 导入 -->
  <div
    class="sticky top-0 z-20 border-b border-[var(--border-line)] bg-[var(--bg-canvas)]"
    :style="isPhone ? { paddingTop: 'env(safe-area-inset-top)' } : null"
  >
    <div class="max-w-6xl w-full mx-auto px-4 sm:px-8 pt-4 sm:pt-5 pb-3 sm:pb-4 flex flex-col gap-2.5 sm:gap-3">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-baseline gap-2.5 sm:gap-3 min-w-0">
          <h2 class="font-display font-extrabold text-lg sm:text-xl tracking-tight">书架</h2>
          <span class="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-[var(--brand-soft)] text-[var(--brand-primary)] border border-[var(--brand-border)] shrink-0">{{ count }} 部作品</span>
        </div>
        <div class="relative flex items-center gap-2 shrink-0">
          <button v-if="canPickFolder" @click="$emit('pick-folder')" class="uiverse-btn min-h-9 sm:min-h-0 px-2.5 sm:px-3" title="导入整个文件夹（支持内含多本 EPUB/ZIP 或漫画图片子文件夹）">
            <svg class="w-3.5 h-3.5 text-[var(--brand-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
            <span class="hidden sm:inline">文件夹</span>
          </button>
          <button @click="$emit('pick-file')" class="uiverse-btn-primary min-h-9 sm:min-h-0 px-2.5 sm:px-3">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            <span class="hidden sm:inline">导入文件</span>
            <span class="sm:hidden">导入</span>
          </button>

          <!-- 移动端：次要操作收进「更多」菜单 -->
          <button
            v-if="isPhone"
            @click="moreOpen = !moreOpen"
            class="uiverse-btn min-h-9 px-2"
            title="更多操作"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>
              <circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>
            </svg>
          </button>

          <div v-if="isPhone && moreOpen" class="fixed inset-0 z-20" @click="moreOpen = false"></div>
          <div
            v-if="isPhone && moreOpen"
            class="absolute right-0 top-full mt-2 w-44 z-30 rounded-xl border border-[var(--border-line)] bg-[var(--bg-card)] shadow-xl p-1.5 flex flex-col gap-0.5"
          >
            <button @click="addDemoManga" class="w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-[var(--fg-main)] hover:bg-[var(--bg-subtle)] transition">+ 示例漫画</button>
            <button @click="addDemoNovel" class="w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-[var(--fg-main)] hover:bg-[var(--bg-subtle)] transition">+ 示例小说</button>
            <div v-if="storageLabel" class="px-3 py-2 font-mono text-[11px] text-[var(--fg-muted)] border-t border-[var(--border-line)]">
              存储 {{ storageLabel }}
            </div>
            <button @click="moreOpen = false; shelf.clearShelf()" class="w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-[var(--bg-subtle)] transition">清空书架</button>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-2 px-2.5 h-9 sm:h-8 rounded-lg border border-[var(--border-line)] bg-[var(--bg-card)] flex-1 min-w-[140px] max-w-full sm:max-w-xs">
          <svg class="w-3.5 h-3.5 text-[var(--fg-muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"/></svg>
          <input
            :value="query"
            @input="$emit('update:query', $event.target.value)"
            type="text"
            placeholder="搜索书名…"
            class="flex-1 min-w-0 bg-transparent border-none outline-none text-xs font-medium placeholder:text-[var(--fg-muted)]"
          />
        </div>

        <div class="flex items-center bg-[var(--bg-subtle)] p-0.5 rounded-lg border border-[var(--border-line)]">
          <button
            v-for="t in types"
            :key="t.value"
            @click="$emit('update:type', t.value)"
            class="px-2.5 py-1.5 sm:py-1 rounded-md text-xs font-semibold transition"
            :style="type === t.value
              ? 'background-color: var(--brand-primary); color: #FFFFFF;'
              : 'background-color: transparent; color: var(--fg-muted);'"
          >
            {{ t.label }}
          </button>
        </div>

        <select
          :value="sort"
          @change="$emit('update:sort', $event.target.value)"
          class="h-9 sm:h-8 px-2 rounded-lg border border-[var(--border-line)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--fg-muted)] outline-none cursor-pointer"
          title="排序方式"
        >
          <option value="recent">最近添加</option>
          <option value="progress">阅读进度</option>
          <option value="title">书名排序</option>
        </select>

        <div v-if="!isPhone" class="ml-auto flex items-center gap-2.5 text-[11px] font-semibold text-[var(--fg-muted)]">
          <button @click="addDemoManga" class="hover:text-[var(--brand-primary)] transition">+ 示例漫画</button>
          <span class="opacity-40">·</span>
          <button @click="addDemoNovel" class="hover:text-[var(--brand-primary)] transition">+ 示例小说</button>
          <span class="opacity-40">·</span>
          <button @click="shelf.clearShelf()" class="hover:text-red-500 transition">清空</button>
          <template v-if="storageLabel">
            <span class="opacity-40">·</span>
            <span class="font-mono" title="浏览器估算的已用存储 / 可用配额">存储 {{ storageLabel }}</span>
          </template>
        </div>
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
import { canPickFolder, formatBytes } from '../services/platform.js';
import { showToast } from '../composables/useToast.js';

const props = defineProps({
  count: { type: Number, default: 0 },
  query: { type: String, default: '' },
  type: { type: String, default: 'all' },
  sort: { type: String, default: 'recent' }
});

defineEmits(['update:query', 'update:type', 'update:sort', 'pick-file', 'pick-folder']);

const shelf = useShelfStore();
const { isPhone } = useViewport();
const moreOpen = ref(false);

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

// 切回桌面布局时收起移动端菜单，避免残留浮层
watch(isPhone, value => {
  if (!value) moreOpen.value = false;
});

const types = [
  { value: 'all', label: '全部' },
  { value: 'manga', label: '漫画' },
  { value: 'novel', label: '小说' },
  { value: 'epub', label: 'EPUB' }
];

function addDemoManga() {
  shelf.unshiftBook(createDemoManga());
  moreOpen.value = false;
  showToast('已添加《示例漫画》到书架');
}

function addDemoNovel() {
  shelf.unshiftBook(createDemoNovel());
  moreOpen.value = false;
  showToast('已添加《示例轻小说》到书架');
}
</script>
