/* ============================================================================
   HOMURA · 主题 Store
   ----------------------------------------------------------------------------
   主题色 / 阅读表面 / 翻页过渡效果。
   高亮态不再手动改 DOM，由组件根据 store 状态做 :class / :style 绑定。
   ========================================================================== */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { showToast } from '../composables/useToast.js';

const SURFACE_CANVAS = { light: '#F8FAFC', warm: '#F6EFE2', dark: '#090D16' };
const THEME_NAMES = { blue: '晴空蓝', red: '绯红金', green: '森系绿', violet: '星夜紫' };
const MODE_LABELS = {
  light: '白昼清爽模式',
  warm: '暖色护眼模式',
  dark: '夜间深邃模式'
};
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
  let surfaceWipeToken = 0;

  function setThemeColor(colorName, silent = false) {
    themeColor.value = colorName;
    document.documentElement.setAttribute('data-theme', colorName);
    try { localStorage.setItem('homura_theme_color', colorName); } catch (e) {}
    if (!silent) showToast(`已切换 UI 主题色：${THEME_NAMES[colorName] || colorName}`);
  }

  function setSurfaceMode(modeName, silent = false) {
    surfaceMode.value = modeName;
    const html = document.documentElement;

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

    // 启动恢复模式（silent）不做动画，直接落色
    if (silent) {
      applyMode();
      applyNativeWindowChrome(modeName);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => html.classList.remove('surface-switching'));
      });
      return;
    }

    // 旧内容区底色整层覆盖，再以右下角为圆心圆形收缩，露出新配色
    const oldCanvas = getComputedStyle(document.body).backgroundColor;
    const token = ++surfaceWipeToken;
    document.querySelectorAll('.surface-wipe').forEach(el => el.remove());

    const wipe = document.createElement('div');
    wipe.className = 'surface-wipe';
    wipe.style.backgroundColor = oldCanvas;
    document.body.appendChild(wipe);

    applyMode();
    // 标题栏与窗口底色在动画开始时就切到新色，和新内容一致
    applyNativeWindowChrome(modeName);
    // 模式已经在 applyMode() 里落地，提示立即给出，不等 1s 擦除动画结束
    showToast(`已切换：${MODE_LABELS[modeName]}`);

    const finish = () => {
      if (token !== surfaceWipeToken) return;
      wipe.remove();
      html.classList.remove('surface-switching');
    };

    if (typeof wipe.animate === 'function') {
      // easeOutExpo 风格非线性曲线：起手快、收尾缓
      const anim = wipe.animate(
        { clipPath: ['circle(150% at 100% 100%)', 'circle(0% at 100% 100%)'] },
        { duration: 1000, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
      );
      anim.finished.then(finish, finish);
    } else {
      finish();
    }
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
