/* ============================================================================
   HOMURA · 主题 Store
   ----------------------------------------------------------------------------
   主题色 / 阅读表面 / 翻页过渡效果。
   高亮态不再手动改 DOM，由组件根据 store 状态做 :class / :style 绑定。
   ========================================================================== */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { showToast } from '../composables/useToast.js';

// 原生窗口 / 浏览器地址栏底色，与 homura.css 的 --md-surface 保持一致
const SURFACE_CANVAS = { light: '#F8FAFC', warm: '#FAF6EE', dark: '#0F1115' };
export const THEME_OPTIONS = Object.freeze([
  { name: 'green', title: '森系绿', tones: ['#BEF0A7', '#A3D48D', '#6F9D5C'] },
  { name: 'mint', title: '薄荷青', tones: ['#98F4D7', '#7BD7BC', '#42A087'] },
  { name: 'cyan', title: '海盐青', tones: ['#99F0FF', '#74D4E4', '#369EAD'] },
  { name: 'blue', title: '深海蓝 (默认)', tones: ['#CCE5FF', '#92CCFF', '#5996C7'] },
  { name: 'violet', title: '鸢尾紫', tones: ['#DFE0FF', '#BCC2FF', '#848CD0'] },
  { name: 'orchid', title: '兰花紫', tones: ['#F3DAFF', '#E2B6FD', '#A981C3'] },
  { name: 'sakura', title: '樱雾粉', tones: ['#FFD8E8', '#FFAFD5', '#C679A0'] },
  { name: 'red', title: '落日赤陶', tones: ['#FFDBD0', '#FFB59F', '#D07A5F'] },
  { name: 'amber', title: '琥珀金', tones: ['#FFDDB9', '#FDB967', '#C08537'] },
  { name: 'olive', title: '橄榄青', tones: ['#F1E580', '#D4C967', '#9C9338'] }
]);
const THEME_NAMES = Object.fromEntries(
  THEME_OPTIONS.map(option => [option.name, option.title.replace(' (默认)', '')])
);
const MODE_LABELS = {
  light: '白昼清爽模式',
  warm: '暖色护眼模式',
  dark: '夜间深邃模式'
};
const SURFACE_REVEAL_DURATION = 720;
const TRANSITION_ORDER = ['slide', 'fade', 'none'];
export const TRANSITION_LABELS = { slide: '丝滑平移', fade: '柔和淡入', none: '极速无动画' };

// 同步原生窗口外观（macOS 标题栏与窗口底色），避免夜间模式下启动闪白
function applyNativeWindowChrome(modeName) {
  const tauriWindow = window.__TAURI__ && window.__TAURI__.window;
  if (!tauriWindow || typeof tauriWindow.getCurrentWindow !== 'function') return;
  const win = tauriWindow.getCurrentWindow();
  const theme = modeName === 'dark' ? 'dark' : 'light';
  const canvas = SURFACE_CANVAS[modeName] || SURFACE_CANVAS.light;
  if (win.setTheme) win.setTheme(theme).catch(() => {});
  if (win.setBackgroundColor) win.setBackgroundColor(canvas).catch(() => {});
}

export const useThemeStore = defineStore('theme', () => {
  const themeColor = ref('blue');
  const surfaceMode = ref('light');
  const transitionStyle = ref('slide');
  let surfaceModeToken = 0;
  let surfaceRevealFrame = 0;
  let surfaceRevealEl = null;

  function setThemeColor(colorName, silent = false) {
    themeColor.value = colorName;
    document.documentElement.setAttribute('data-theme', colorName);
    try { localStorage.setItem('homura_theme_color', colorName); } catch (e) {}
    if (!silent) showToast(`已切换 UI 主题色：${THEME_NAMES[colorName] || colorName}`);
  }

  function setSurfaceMode(modeName, silent = false, origin = null) {
    surfaceMode.value = modeName;
    const html = document.documentElement;
    const token = ++surfaceModeToken;

    const applyMode = () => {
      // 关闭过渡并强制回流，避免页面颜色渐变而标题栏瞬间换色造成的不同步
      html.classList.add('surface-switching');
      void html.offsetWidth;
      html.setAttribute('data-mode', modeName);
      if (modeName === 'dark') {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
      // 移动端浏览器地址栏 / 状态栏跟随阅读表面底色
      const meta = document.getElementById('homuraThemeColor');
      if (meta) meta.setAttribute('content', SURFACE_CANVAS[modeName] || SURFACE_CANVAS.light);
      try { localStorage.setItem('homura_surface_mode', modeName); } catch (e) {}
    };

    const finish = () => {
      if (token !== surfaceModeToken) return;
      if (surfaceRevealFrame) cancelAnimationFrame(surfaceRevealFrame);
      surfaceRevealFrame = 0;
      if (surfaceRevealEl) surfaceRevealEl.remove();
      surfaceRevealEl = null;
      html.classList.remove('surface-switching');
    };

    const finishNextFrame = () => {
      requestAnimationFrame(() => requestAnimationFrame(finish));
    };

    // 启动恢复模式（silent）不做动画，直接落色
    if (silent) {
      applyMode();
      applyNativeWindowChrome(modeName);
      finishNextFrame();
      return;
    }

    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      applyMode();
      applyNativeWindowChrome(modeName);
      showToast(`已切换：${MODE_LABELS[modeName]}`);
      finishNextFrame();
      return;
    }

    // 旧表面色盖住新配色，再从点击位置打开圆形透明孔，形成新配色展开效果
    const oldCanvas = getComputedStyle(document.body).backgroundColor;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = Number.isFinite(origin?.x) ? origin.x : viewportWidth / 2;
    const centerY = Number.isFinite(origin?.y) ? origin.y : viewportHeight / 2;
    const maxRadius = Math.hypot(
      Math.max(centerX, viewportWidth - centerX),
      Math.max(centerY, viewportHeight - centerY)
    ) + 2;

    if (surfaceRevealFrame) cancelAnimationFrame(surfaceRevealFrame);
    if (surfaceRevealEl) surfaceRevealEl.remove();

    const reveal = document.createElement('div');
    reveal.className = 'surface-reveal';
    reveal.style.backgroundColor = oldCanvas;
    surfaceRevealEl = reveal;

    const renderCircle = (radius) => {
      const mask = `radial-gradient(circle at ${centerX}px ${centerY}px, transparent ${radius}px, var(--md-on-surface) ${radius + 1}px)`;
      reveal.style.webkitMaskImage = mask;
      reveal.style.maskImage = mask;
    };

    renderCircle(0);
    document.body.appendChild(reveal);
    applyMode();
    // 标题栏与窗口底色和内容区在同一帧切到新色
    applyNativeWindowChrome(modeName);
    showToast(`已切换：${MODE_LABELS[modeName]}`);

    const startedAt = performance.now();
    const animate = (now) => {
      if (token !== surfaceModeToken) return;
      const progress = Math.min(1, (now - startedAt) / SURFACE_REVEAL_DURATION);
      const eased = 1 - Math.pow(1 - progress, 4);
      renderCircle(maxRadius * eased);
      if (progress < 1) {
        surfaceRevealFrame = requestAnimationFrame(animate);
      } else {
        finish();
      }
    };
    surfaceRevealFrame = requestAnimationFrame(animate);
  }

  function toggleTransitionStyle() {
    const nextIdx = (TRANSITION_ORDER.indexOf(transitionStyle.value) + 1) % TRANSITION_ORDER.length;
    transitionStyle.value = TRANSITION_ORDER[nextIdx];
    showToast('翻页过渡效果：' + TRANSITION_LABELS[transitionStyle.value]);
  }

  return {
    themeColor,
    surfaceMode,
    transitionStyle,
    setThemeColor,
    setSurfaceMode,
    toggleTransitionStyle
  };
});
