/* ============================================================================
   HOMURA · 示例内容
   ----------------------------------------------------------------------------
   首次使用时放进书架的示例漫画（内联 SVG）与示例轻小说。
   纯工厂函数：只返回书籍对象，入架动作由 shelf store 完成。
   ========================================================================== */


function createDemoMangaSvg(pageNumber, title, subtitle) {
  const isRightSide = pageNumber % 2 === 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 1200" width="850" height="1200">
    <rect width="850" height="1200" fill="#ffffff"/>
    <rect x="28" y="28" width="794" height="1144" rx="12" fill="#f8fafc" stroke="#0f172a" stroke-width="5"/>
    <rect x="56" y="56" width="738" height="350" rx="8" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>
    <circle cx="${isRightSide ? 600 : 250}" cy="230" r="100" fill="#3b82f6" opacity="0.22"/>
    <text x="425" y="220" font-family="sans-serif" font-size="40" font-weight="900" fill="#0f172a" text-anchor="middle">${title}</text>
    <text x="425" y="275" font-family="sans-serif" font-size="20" font-weight="700" fill="#2563eb" text-anchor="middle">${subtitle}</text>
    <rect x="56" y="436" width="354" height="380" rx="8" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
    <text x="233" y="630" font-family="sans-serif" font-size="24" font-weight="800" fill="#1e293b" text-anchor="middle">分镜 A (左格)</text>
    <rect x="440" y="436" width="354" height="380" rx="8" fill="#dbeafe" stroke="#0f172a" stroke-width="3"/>
    <text x="617" y="630" font-family="sans-serif" font-size="24" font-weight="800" fill="#1e293b" text-anchor="middle">分镜 B (右格)</text>
    <rect x="56" y="846" width="738" height="280" rx="8" fill="#0f172a"/>
    <text x="425" y="975" font-family="sans-serif" font-size="50" font-weight="900" fill="#ffffff" text-anchor="middle">PAGE 0${pageNumber}</text>
    <text x="425" y="1035" font-family="sans-serif" font-size="18" font-weight="700" fill="#60a5fa" text-anchor="middle">双缓冲滑轨过渡 · 零卡顿硬件加速 · 暖色护眼 · 鼠标滚轮</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function createDemoManga() {
  const pages = [
    createDemoMangaSvg(1, '第1页 · 封面 (Cover)', '双页模式下首页单独对齐'),
    createDemoMangaSvg(2, '第2页 · 苍穹启航', '日漫模式下位于右侧先读'),
    createDemoMangaSvg(3, '第3页 · 星轨观测', '日漫模式下位于左侧后读（左边是下一页）'),
    createDemoMangaSvg(4, '第4页 · 跨页展开 (右)', '双缓冲滑轨：旧页滑出 + 新页同步滑入'),
    createDemoMangaSvg(5, '第5页 · 跨页展开 (左)', '支持鼠标滚轮直接丝滑翻页'),
    createDemoMangaSvg(6, '第6页 · 终章预告', '条漫模式支持单张完整显示')
  ];
  return {
    id: 'demo_manga_' + Date.now(),
    type: 'manga',
    title: 'Homura 苍穹航路分镜集',
    cover: pages[0],
    pageItems: pages.map(url => ({ url })),
    pageCount: pages.length
  };
}

export function createDemoNovel() {
  const chapters = [
    {
      title: '序章 双缓冲丝滑翻页与智能分页',
      htmlContent: `
        <p>深夜的第七观测塔顶层，空气中弥漫着清凉的夜风与古老星盘运转的微响。</p>
        <p>「现在的翻页采用了真正的双缓冲滑轨架构（Double-Buffered Track Engine）。」少年合上怀表，微笑着指向眼前的纸页，「当您点击下一页或滚动鼠标滚轮时，旧的一页会优雅地向旁滑出，同时新的一页从另一侧无缝滑入，就像在平板电脑上翻阅实体书一样自然。」</p>
        <p>为了彻底消除任何细微卡顿，在 260 毫秒的翻页动画播放期间，后台会自动暂停一切压缩包解压任务，将浏览器 100% 的 GPU 算力全部用于渲染丝滑帧率；等动画落定后，再静默为您预解码后面 4 页的内容。</p>
        <p>无论您导入的 .epub 或 .txt 一章有五千字还是一万字，智能屏幕分页器都会根据当前窗口高度与字号，自动把长章节精准切分成刚好装满一屏的独立书页，再也不会在卡片内部出现纵向滚动条。</p>
        <p>您还可以在顶部右上角点击「过渡：丝滑平移 / 柔和淡入 / 极速无动画」，随时选择最适合自己阅读节奏的过渡效果。</p>
      `
    },
    {
      title: '第一章 星海坠落与观测者之夜',
      htmlContent: `
        <p>警报是在指针指向凌晨三点整时拉响的。蔚蓝色的魔导回路瞬间点亮了整座天球学园的外墙。</p>
        <p>银白色的长发如瀑布般散开，伴随着无数闪烁的星砂，少女自夜空之中直坠而下，落在了观测台中央。</p>
        <p>「终于找到你了，第七观测者。」少女抬起澄澈的眼眸，向他伸出右手。</p>
        <p>您可以随时在左侧外观面板切换「白昼 / 护眼 / 夜间」三种环境模式，以及四款不同的主题配色。</p>
      `
    }
  ];
  return {
    id: 'demo_novel_' + Date.now(),
    type: 'epub',
    title: '星降之夜的观测者 (轻小说)',
    cover: null,
    chapters: chapters,
    pageCount: chapters.length
  };
}
