// HOMURA · 全屏按钮提案预览脚本
const body = document.body;

document.querySelectorAll('.seg').forEach((btn) => {
  btn.addEventListener('click', () => {
    const set = btn.dataset.set;
    document.querySelectorAll(`.seg[data-set="${set}"]`).forEach((b) => {
      b.classList.toggle('on', b === btn);
    });
    body.dataset[set] = btn.dataset.val;
  });
});

// 演示：点击全屏按钮切换图标与 aria 状态（预览内不真的进入系统全屏）
document.querySelectorAll('.board [data-fs]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const on = btn.classList.toggle('on');
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? '退出全屏 (F)' : '全屏 (F)';
    btn.setAttribute('aria-label', btn.title);
  });
});

// 支持 ?mode=light|warm|dark&view=desk|mobile 直接截取指定状态
const params = new URLSearchParams(location.search);
['mode', 'view'].forEach((key) => {
  const val = params.get(key);
  if (!val || !document.querySelector(`.seg[data-set="${key}"][data-val="${val}"]`)) return;
  body.dataset[key] = val;
  document.querySelectorAll(`.seg[data-set="${key}"]`).forEach((b) => {
    b.classList.toggle('on', b.dataset.val === val);
  });
});
