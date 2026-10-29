<template>
  <!-- 外观设置面板内容：主题色 + 阅读模式（桌面弹层 / 移动端底部弹层共用） -->
  <div class="space-y-3">
    <div>
      <p class="text-[10px] font-semibold text-[var(--fg-muted)] mb-2">主题色</p>
      <div class="flex items-center gap-2">
        <button
          v-for="s in swatches"
          :key="s.name"
          @click="theme.setThemeColor(s.name)"
          :class="['theme-swatch', s.cls, { 'active-swatch': theme.themeColor === s.name }]"
          :title="s.title"
        ></button>
      </div>
    </div>
    <div>
      <p class="text-[10px] font-semibold text-[var(--fg-muted)] mb-2">阅读模式</p>
      <div class="flex flex-col gap-1.5">
        <button
          v-for="m in modes"
          :key="m.name"
          @click="theme.setSurfaceMode(m.name)"
          class="w-full flex items-center gap-1.5 text-left px-2.5 py-1.5 rounded-md text-xs font-semibold transition"
          :style="modeBtnStyle(m.name)"
          :title="m.title"
        >
          <svg v-if="m.name === 'light'" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" stroke-width="2"/>
            <path stroke-linecap="round" stroke-width="2" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
          </svg>
          <svg v-else-if="m.name === 'warm'" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20c8 0 16-4 16-16-8 0-16 4-16 16z"/>
            <path stroke-linecap="round" stroke-width="2" d="M4 20c4-4 8-6 12-8"/>
          </svg>
          <svg v-else class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.8A8.5 8.5 0 1111.2 3a6.5 6.5 0 009.8 9.8z"/>
          </svg>
          <span>{{ m.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useThemeStore } from '../stores/theme.js';

const theme = useThemeStore();

const swatches = [
  { name: 'blue', cls: 'bg-[#2563EB]', title: '晴空蓝 (默认)' },
  { name: 'red', cls: 'bg-[#E61919]', title: '绯红金' },
  { name: 'green', cls: 'bg-[#059669]', title: '森系绿' },
  { name: 'violet', cls: 'bg-[#7C3AED]', title: '星夜紫' }
];

const modes = [
  { name: 'light', label: '白昼', title: '纯净白昼模式' },
  { name: 'warm', label: '护眼', title: '暖色护眼模式' },
  { name: 'dark', label: '夜间', title: '深邃夜间模式' }
];

function modeBtnStyle(name) {
  return theme.surfaceMode === name
    ? { backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }
    : { backgroundColor: 'var(--bg-subtle)', color: 'var(--fg-muted)' };
}
</script>
