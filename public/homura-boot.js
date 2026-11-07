// HOMURA · 启动引导（首帧前同步执行）
// 抽成外部文件而不是内联 <script>：CSP 的 script-src 不含 'unsafe-inline'，
// 内联脚本会被拦死，导致启动白闪与主题恢复失效。放在 head 里以普通脚本同步加载，
// 执行时机与原内联写法一致。

// Android 系统启动页退出后，用同尺寸静态图标无缝接棒到 WebView
if (/Android/i.test(navigator.userAgent) && location.hostname === 'tauri.localhost') {
  document.documentElement.classList.add('homura-native-splash');
}
window.__HOMURA_SPLASH_STARTED_AT__ = performance.now();
document.documentElement.classList.add('homura-splashing');

// 在首帧渲染前同步恢复主题色与阅读模式，避免启动时从亮色闪到夜间模式
(function () {
  try {
    var theme = localStorage.getItem('homura_theme_color');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    var mode = localStorage.getItem('homura_surface_mode');
    if (mode) {
      document.documentElement.setAttribute('data-mode', mode);
      if (mode === 'dark') document.documentElement.classList.add('dark');
    }
    // 移动端浏览器地址栏跟随阅读表面底色，避免启动瞬间白条
    var canvases = { light: '#F8FAFC', warm: '#FAF6EE', dark: '#0F1115' };
    var meta = document.getElementById('homuraThemeColor');
    if (meta && !mode) meta.setAttribute('content', canvases.light);
    if (meta && mode && canvases[mode]) meta.setAttribute('content', canvases[mode]);
  } catch (e) {}
})();
