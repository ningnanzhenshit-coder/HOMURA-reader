/* ============================================================================
   HOMURA · 全局状态与通用 UI
   ----------------------------------------------------------------------------
   可变的阅读状态、布局配置、Toast、主题色 / 阅读表面 / 翻页过渡 / 全屏，
   以及阅读器工具栏的高亮状态。其余模块通过 import { state } 共享状态。
   ========================================================================== */

export const state = {
  library: [],
  currentBook: null,
  currentIndex: 0,
  activePages: [],
  renderToken: 0,
  webtoonObserver: null,
  lastWheelTurnTime: 0,

  // Double-Buffer State for 60fps / 120fps Hardware-Accelerated Page Turning
  currentStageModeKey: '',
  activeBufferSlot: 0, // 0 = Buffer A, 1 = Buffer B
  activeTransitionAnims: [],
  preloadTimer: null,
  resizeTimer: null,

  layoutConfig: {
    direction: 'ltr',          // 'ltr' | 'rtl' | 'vertical'
    spread: 2,                 // 1 | 2
    coverOffset: true,
    fontSize: 18,
    rtlInvertButtons: true,    // 日漫右→左模式下默认「左边是下一页」
    webtoonFit: 'screen',      // 'screen' | 'medium' | 'wide'
    themeColor: 'blue',        // 'blue' | 'red' | 'green' | 'violet'
    surfaceMode: 'light',      // 'light' | 'warm' | 'dark'
    transitionStyle: 'slide'   // 'slide' (丝滑平移) | 'fade' (柔和淡入) | 'none' (极速无动画)
  }
};

export function showToast(msg) {
  const existing = document.getElementById('hikariToast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'hikariToast';
  el.style.backgroundColor = 'var(--brand-primary)';
  el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] text-white px-4 py-2 rounded-xl shadow-xl text-xs font-bold tracking-wide transition-all duration-200 pointer-events-none';
  el.innerText = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 2200);
}

export function setThemeColor(colorName, silent = false) {
  state.layoutConfig.themeColor = colorName;
  document.documentElement.setAttribute('data-theme', colorName);
  try { localStorage.setItem('homura_theme_color', colorName); } catch (e) {}

  document.querySelectorAll('[data-swatch]').forEach(btn => {
    if (btn.getAttribute('data-swatch') === colorName) {
      btn.classList.add('active-swatch');
    } else {
      btn.classList.remove('active-swatch');
    }
  });

  const names = { blue: '晴空蓝', red: '绯红金', green: '森系绿', violet: '星夜紫' };
  if (!silent) showToast(`已切换 UI 主题色：${names[colorName] || colorName}`);
  if (state.currentBook) updateToolbarHighlight();
}

const SURFACE_CANVAS = { light: '#F8FAFC', warm: '#F6EFE2', dark: '#090D16' };

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

export function setSurfaceMode(modeName, silent = false) {
  state.layoutConfig.surfaceMode = modeName;
  const html = document.documentElement;
  html.setAttribute('data-mode', modeName);
  if (modeName === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
  try { localStorage.setItem('homura_surface_mode', modeName); } catch (e) {}
  applyNativeWindowChrome(modeName);

  document.querySelectorAll('[data-mode-btn]').forEach(btn => {
    const isCurrent = btn.getAttribute('data-mode-btn') === modeName;
    if (isCurrent) {
      btn.style.backgroundColor = 'var(--brand-primary)';
      btn.style.color = '#FFFFFF';
    } else {
      btn.style.backgroundColor = 'transparent';
      btn.style.color = 'var(--fg-muted)';
    }
  });

  const labels = {
    light: '☀️ 白昼清爽模式',
    warm: '🌾 暖色调护眼模式（羊皮纸柔光）',
    dark: '🌙 夜间深邃模式'
  };
  if (!silent) showToast(`已切换：${labels[modeName]}`);
}

export function toggleTransitionStyle() {
  const order = ['slide', 'fade', 'none'];
  const labels = { slide: '丝滑平移', fade: '柔和淡入', none: '极速无动画' };
  const nextIdx = (order.indexOf(state.layoutConfig.transitionStyle) + 1) % order.length;
  state.layoutConfig.transitionStyle = order[nextIdx];
  document.getElementById('transitionStyleStatus').innerText = labels[state.layoutConfig.transitionStyle];
  showToast('翻页过渡效果：' + labels[state.layoutConfig.transitionStyle]);
}

export function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      showToast('无法进入全屏模式: ' + err.message);
    });
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

export function updateToolbarHighlight() {
  const activeStyle = 'background-color: var(--brand-primary); color: #FFFFFF;';
  const inactiveStyle = 'background-color: transparent; color: var(--fg-muted);';

  const btnRTL = document.getElementById('btnDirRTL');
  const btnLTR = document.getElementById('btnDirLTR');
  const btnVert = document.getElementById('btnDirVertical');
  const btnSingle = document.getElementById('btnSpreadSingle');
  const btnDouble = document.getElementById('btnSpreadDouble');
  const btnOffset = document.getElementById('btnCoverOffset');
  const btnWebtoonFit = document.getElementById('btnWebtoonFit');

  const config = state.layoutConfig;
  btnRTL.setAttribute('style', config.direction === 'rtl' ? activeStyle : inactiveStyle);
  btnLTR.setAttribute('style', config.direction === 'ltr' ? activeStyle : inactiveStyle);
  btnVert.setAttribute('style', config.direction === 'vertical' ? activeStyle : inactiveStyle);

  const isVertical = config.direction === 'vertical';
  btnSingle.setAttribute('style', (!isVertical && config.spread === 1) ? activeStyle : inactiveStyle);
  btnDouble.setAttribute('style', (!isVertical && config.spread === 2) ? activeStyle : inactiveStyle);

  // Keep the xl-only button in flow and just hide its paint, so toggling it never shifts the centered toolbar
  btnOffset.classList.toggle('invisible', isVertical || config.spread !== 2);

  // Reserve the slot even when the button is not applicable, so entering webtoon mode never shifts the centered pills
  btnWebtoonFit.classList.toggle('invisible', !(isVertical && state.currentBook && state.currentBook.type === 'manga'));

  const subStatus = document.getElementById('readerSubStatus');
  const leftNavBtn = document.getElementById('leftNavBtn');
  const rightNavBtn = document.getElementById('rightNavBtn');
  const leftNavText = document.getElementById('leftNavText');
  const rightNavText = document.getElementById('rightNavText');
  const swapTapBtn = document.getElementById('swapTapModeBtn');
  const slider = document.getElementById('readerSlider');

  // Both labels share the same character count so the header text never changes width when toggling spread
  const spreadLabel = config.spread === 2 ? '双页并排' : '单页模式';
  const inverted = config.direction === 'rtl' && config.rtlInvertButtons;

  if (config.direction === 'rtl') {
    subStatus.innerText = `日漫右→左 (${inverted ? '左边是下一页' : '右边是下一页'}) · 双缓冲丝滑翻页`;
    leftNavText.innerText = inverted ? '下一页' : '上一页';
    rightNavText.innerText = inverted ? '上一页' : '下一页';
    leftNavBtn.className = inverted ? 'uiverse-btn-primary py-1 px-3.5 shrink-0' : 'uiverse-btn py-1 px-3.5 shrink-0';
    rightNavBtn.className = inverted ? 'uiverse-btn-primary py-1 px-3.5 shrink-0' : 'uiverse-btn py-1 px-3.5 shrink-0';
    swapTapBtn.innerText = inverted ? '日漫:左翻下一页(滚轮可用)' : '日漫:右翻下一页(滚轮可用)';
    if (inverted) slider.classList.add('rtl-slider');
    else slider.classList.remove('rtl-slider');
  } else if (config.direction === 'ltr') {
    subStatus.innerText = `左→右 (右边是下一页) · ${spreadLabel} · 双缓冲丝滑翻页`;
    leftNavText.innerText = '上一页';
    rightNavText.innerText = '下一页';
    leftNavBtn.className = 'uiverse-btn py-1 px-3.5 shrink-0';
    rightNavBtn.className = 'uiverse-btn-primary py-1 px-3.5 shrink-0';
    swapTapBtn.innerText = `滚轮可翻页 · ${spreadLabel}`;
    slider.classList.remove('rtl-slider');
  } else {
    subStatus.innerText = `纵向长卷模式 · 连续平滑滚动`;
    leftNavText.innerText = '上滚一屏';
    rightNavText.innerText = '下滚一屏';
    leftNavBtn.className = 'uiverse-btn py-1 px-3.5 shrink-0';
    rightNavBtn.className = 'uiverse-btn-primary py-1 px-3.5 shrink-0';
    swapTapBtn.innerText = '上→下长卷';
    slider.classList.remove('rtl-slider');
  }
}
