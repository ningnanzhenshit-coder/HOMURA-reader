<template>
  <!-- 外观设置面板内容：主题色 + 阅读模式（桌面浮层 / 手机底部 sheet 共用） -->
  <div>
    <div class="py-3 border-t border-[var(--md-outline-variant)]">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-[11px] font-semibold">阅读模式</span>
        <b class="font-mono text-[9.5px] font-medium text-[var(--md-on-surface-variant)]">{{ modeLabel }}</b>
      </div>
      <div class="flex p-[3px] rounded-[20px] bg-[var(--md-surface-high)]">
        <button
          v-for="m in modes"
          :key="m.name"
          @click="theme.setSurfaceMode(m.name)"
          class="flex-1 py-[7px] rounded-[17px] text-[10.5px] font-semibold transition-colors duration-200"
          :class="theme.surfaceMode === m.name
            ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
            : 'text-[var(--md-on-surface-variant)]'"
          :title="m.title"
        >{{ m.label }}</button>
      </div>
    </div>

    <div class="py-3 border-t border-[var(--md-outline-variant)]">
      <div class="flex items-baseline justify-between mb-3">
        <span class="text-[11px] font-semibold">主题色</span>
        <b class="font-mono text-[9.5px] font-medium text-[var(--md-on-surface-variant)]">{{ themeLabel }}</b>
      </div>
      <div class="flex items-center gap-3 flex-nowrap overflow-x-auto no-scrollbar py-1">
        <button
          v-for="s in swatches"
          :key="s.name"
          @click="theme.setThemeColor(s.name)"
          :class="['theme-swatch', { 'active-swatch': theme.themeColor === s.name }]"
          :style="{ backgroundColor: s.seed }"
          :title="s.title"
          :aria-label="s.title"
          :aria-pressed="theme.themeColor === s.name"
        ></button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useThemeStore } from '../stores/theme.js';

const theme = useThemeStore();

const swatches = [
  { name: 'blue', seed: '#0061A4', title: '深海蓝 (默认)' },
  { name: 'red', seed: '#9C4233', title: '落日赤陶' },
  { name: 'green', seed: '#386A20', title: '森系绿' },
  { name: 'violet', seed: '#6750A4', title: '鸢尾紫' },
  { name: 'sakura', seed: '#984061', title: '樱雾粉' },
  { name: 'mint', seed: '#006A60', title: '薄荷青' },
  { name: 'amber', seed: '#785900', title: '琥珀金' }
];

const modes = [
  { name: 'light', label: '白昼', title: '纯净白昼模式' },
  { name: 'warm', label: '护眼', title: '暖色护眼模式' },
  { name: 'dark', label: '夜间', title: '深邃夜间模式' }
];

const modeLabel = computed(() => (modes.find(m => m.name === theme.surfaceMode) || modes[0]).label);
const themeLabel = computed(() => (swatches.find(s => s.name === theme.themeColor) || swatches[0]).title.replace(' (默认)', ''));
</script>
