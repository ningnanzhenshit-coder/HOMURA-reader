# AGENTS.md — HOMURA 协作指南

> 本文件写给接手 HOMURA 的 AI agent 或新协作者。动代码前先读完这里。
> README、`.trae/documents` 里的旧笔记可能滞后；若与代码冲突，以**当前代码 + 本文件**为准。

## 1. 项目是什么

HOMURA 是一个**本地优先**的 ACGN 阅读器：漫画、轻小说、图集拖进来就能看，解析与渲染全部在本机完成，不上传任何文件。桌面端用 Tauri 2 打包（macOS / Windows / Linux），同一套前端也构建 Android APK。

- 当前版本 `2.1.1`
- 技术栈：Vue 3 + Pinia + Vite 6 + Tauri 2（Rust）
- 纯 JavaScript，没有 TypeScript、没有 ESLint、没有自动测试
- 数据存本机 IndexedDB / OPFS；只有主题偏好写 localStorage

支持的格式：

| 格式 | 扩展名 | 实现入口 |
| --- | --- | --- |
| EPUB / KEPUB | `.epub`、`.kepub.epub` | `src/services/parsers.js` |
| PDF | `.pdf` | `src/services/pdf.js`（pdf.js，按页懒渲染） |
| MOBI | `.mobi`、`.prc`、`.azw` | `src/services/mobi.js`（不支持 DRM / AZW3） |
| 漫画压缩包 | `.cbz`、`.zip` | `src/services/parsers.js` |
| 纯文本 / Markdown | `.txt`、`.md` | `parsers.js` + `markdown.js` |
| 图片文件夹 | jpg/jpeg/png/webp/gif/avif/bmp | `parsers.js` 的 `buildImageFolderBooks` |

## 2. 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装前端依赖；Tauri 命令找不到时先跑这个 |
| `npm run dev:vite` | 只起 Vite 开发服务器，固定端口 **5173**，带 HMR |
| `npm run build:vite` | 只构建前端到 `dist/`（最常用的快速验证） |
| `npm run dev` | `dev:vite` + `tauri dev`，打开桌面窗口 |
| `npm run build` | `build:vite` + `tauri build`，产物在 `src-tauri/target/release/bundle/` |
| `npm run android:dev` | Android 开发 |
| `npm run android:build` | Android arm64 APK（debug 签名） |

环境要求：Node.js 22+、Rust stable ≥ 1.77.2，以及对应平台的 Tauri 依赖。

**验证方式**：`npm run build:vite` 必须通过；然后在 `http://localhost:5173` 用浏览器检查控制台无报错，再按改动范围手动验证桌面 / 窄屏 / 三种表面模式。`dist/index.html` 不能直接 `file://` 双击打开，必须走开发服务器或静态服务器。

## 3. 目录与职责

```text
index.html                 Vite 入口；首帧前同步恢复主题的内联脚本
vite.config.js             Vue 插件 + 相对路径 base + pdf.js 资源同步插件
src/
  main.js                  createApp + Pinia
  App.vue                  总布局、FAB 导入菜单、离屏分页测量器
  assets/homura.css        MD3 token、阅读表面、组件类、动效
  stores/
    theme.js               主题色 / 白昼-护眼-夜间 / 翻页过渡 / 原生窗口外观
    shelf.js               书架、进度映射、示例书、IndexedDB 恢复
    reader.js              当前书、页码、双缓冲、排版配置、翻页动作
    ui.js                  阅读器工具栏显隐、设置/目录抽屉、全屏
  services/
    storage.js             IndexedDB homura_shelf
    opfs.js                OPFS 原始文件存储
    platform.js            平台能力探测、formatBytes
    parsers.js             EPUB/CBZ/ZIP/TXT/MD/PDF/MOBI 解析总入口
    pdf.js                 pdf.js 懒加载、页面位图、LRU 缓存
    mobi.js                PalmDOC 解析
    markdown.js            marked + 安全渲染器
    pagination.js          小说智能分页、章节/图片页构建
    progress.js            阅读进度与排版记忆、落盘节流
    restore.js             原文件句柄 / OPFS / Blob 存档恢复
    demo.js                空书架示例书
    utils.js               escapeHtml 等小工具
  composables/
    useImporter.js         文件/文件夹/拖拽导入、配额预警
    useShortcuts.js        键盘 / 滚轮翻页
    useToast.js            showToast
    useViewport.js         宽度、触屏、断点
  components/              Vue 组件（见下方 UI 说明）
src-tauri/                 Tauri 2 壳：lib.rs、tauri.conf.json、capabilities
public/vendor/             运行时 Tailwind（断网可用），不要换成构建版
public/pdfjs/              pdf.js 运行时资源，由 vite 插件生成，已 gitignore
scripts/release-notes.mjs  Conventional Commits → Release 说明
design-preview/            设计原型 HTML 与截图，不是生产代码
.github/workflows/         三平台 + Android 自动打包
```

注意：README 里的「项目结构」段落仍列着 `AppHeader / DropZone / ReaderToolbar` 等旧组件名，**已过时**，实际以 `src/` 为准。

## 4. 代码与架构约定

- **Vue 3 `<script setup>` 单文件组件**，纯 JS。保持现有风格：2 空格缩进、单引号、语句结尾分号。
- 分层边界：
  - `services/` 不依赖 Vue / Pinia，负责解析、存储、平台适配；需要 DOM/Canvas 的逻辑（如 PDF 渲染）也集中在这里。
  - `stores/` 只放状态与动作，不直接写复杂 DOM。
  - `composables/` 放可复用的组合逻辑。
  - `components/` 只负责视图与交互。
- Pinia 使用 **setup 写法**（`defineStore('x', () => {...})`），动作就是普通函数。
- **重对象必须 `shallowRef`**：`zipContent`、`File`、`Animation`、timer、DOM 引用一律不要被 Vue 深度代理，否则会拖慢动画，甚至让 `Animation.cancel()` 异常。
- 翻页引擎 `PaginatedView.vue` / `WebtoonView.vue` **直接操作 ref DOM + Web Animations API**，不走响应式重渲染。不要为了“优雅”改写成 `v-for` + 响应式布局。
- Tauri 通过 `window.__TAURI__` 全局对象调用，项目**没有**安装 `@tauri-apps/api`。新增原生能力时同时更新 `src-tauri/capabilities/default.json` 的 permissions。
- 图标全部内联 SVG，不引入图标库 / 组件库。新增依赖需要明确理由。
- 注释用中文；复杂模块顶部保留现有的 banner 注释风格。只在逻辑不直观处写注释，不要给没改动的代码补注释。
- 用户可见的提示统一走 `showToast()`，不要自己写 alert / 自制 toast。
  
## 5. UI 规则（强约束）

界面已全量 Material Design 3 化：**10 套主题 × 白昼/护眼/夜间 3 种表面**。新增或修改 UI 时必须遵守以下规则。

### 5.1 颜色

- 所有颜色走 CSS 变量 `--md-*`，Tailwind 写任意值类，例如 `bg-[var(--md-surface-container)]`、`text-[var(--md-on-surface-variant)]`。
- **禁止新增 hex / rgb / 纯黑纯白**。需要派生色用 `color-mix(in oklab, var(--md-x) NN%, ...)`；阴影、渐变里的透明色除外。
- 容器色必须成对使用 `on-*` 文字色；暗色模式靠这对 token 自动反转，不要写死白字/黑字。
- 不要再用旧别名 `--brand-* / --bg-* / --fg-*`；新代码直接用 `--md-*`。
- Tailwind 在 CSS 变量上直接加透明度修饰（如 `bg-[var(--md-surface)]/92`）不可靠，会变成透明；需要透明度就用 `color-mix`。
- 一屏只保留一个 `primary` 实心主行动（书架只有「导入」FAB）。

### 5.2 主题与表面

- 根节点靠 `data-theme`（green/mint/cyan/blue/violet/orchid/sakura/red/amber/olive）+ `data-mode`（light/warm/dark）切换。组件不得自行切主题，统一调 `theme.setThemeColor()` / `theme.setSurfaceMode()`。
- 新增主题必须同步：`homura.css` 的明色块、暗色块；`theme.js` 的 `THEME_OPTIONS`（名称与三阶预览色）；以及 MD3 token 文档（如本地存在）。两处入口共用 `ThemeSwatchGrid.vue`，不要再复制色板数组。
- 外观面板宽 **280px**，10 个主题色块固定为 **5 列 × 2 行**；单个色块保持约 44px 的触控尺寸。

### 5.3 布局与断点

- 布局主断点 **900px**：`<900` 走手机布局（底部导航 + bottom sheet），`>=900` 走桌面布局（96px Navigation Rail + side sheet）。JS 用 `isCompact`，Tailwind 用 `min-[900px]:`。
- `useViewport` 还暴露 `isPhone(≤767)`、`isTablet(768-1023)`、`isDesktop(≥1024)`，只用于细节，不要拿它替代 900 主断点。
- 桌面窗口 `minWidth` 是 900，所以桌面端基本不会进入 compact；compact 主要服务于 Android / 浏览器窄屏调试。
- 桌面骨架：96px rail（`w-24`）→ 主列 → 64px sticky 顶栏（手机 56px）。
- 手机底部导航固定 `height: calc(5rem + env(safe-area-inset-bottom))`，内容区必须挂 `.md-bottom-nav-space`。
- 网格只用 `.md-shelf-grid`，跨列用 `.md-featured-cell`；FAB 用 `.md-fab-pos`。不要在组件里另写 `grid-cols-*`。
- 抽屉：桌面右侧 `w-[372px]`；手机底部 `max-h-[78dvh] rounded-t-[28px]` + 拖拽条 + 安全区 padding。遮罩用 `.md-scrim`，进出场用 `md-sheet-enter-active` / `md-sheet-leave-active`。
- z-index 阶梯：sticky 顶栏 20，rail / 菜单 30，手机底部导航 40，遮罩 40，sheet / 浮层 50，toast 10000。新增层先沿用现有层级，不要压过 toast。

### 5.4 文字与动效

- 字体：`font-sans` 正文（Inter/PingFang），`font-display` 书封标题，`font-mono` 元信息，竖排书封用宋体 / Instrument Serif。
- 字号沿用现有档位：页面标题 21/22、sheet 标题 17、正文/输入 13、分组标签 11、分段控件 10.5、元信息 8-8.5。不要随手插 14/15/16。
- 动效统一 200ms `cubic-bezier(0.2, 0, 0, 1)`；卡片 hover 可用 280ms `cubic-bezier(0.16, 1, 0.3, 1)`。只过渡颜色/位移/阴影，不给布局属性加 transition。
- 尊重 `prefers-reduced-motion`。图标按钮必须有 `title` 或 `aria-label`；开关用 `role="switch"`；禁止 `<div @click>` 当按钮。

### 5.5 参考

如果本地还保留 `.trae/skills/homura-md3-ui/SKILL.md` 和 `references/tokens.md`，先读它们。注意 `.trae/` 被 gitignore，克隆仓库后可能不存在；此时以本节为最小规则集。

## 6. 不能破坏的行为

这些是已经踩过坑、且用户明确要求保留的行为：

1. **启动不许黑屏**：`tauri.conf.json` 里主窗口 `visible: false`，`src-tauri/src/lib.rs` 在 `PageLoadEvent::Finished` 后才 `show()`。不要改成启动即显示。
2. **标题栏跟内容一起换色**：模式切换时，原生窗口 `setTheme` / `setBackgroundColor` 必须在动画**开始时**调用，不能等动画结束。逻辑在 `theme.js` 的 `setSurfaceMode`。
3. **模式切换动画**：从被点击的「白昼 / 护眼 / 夜间」按钮中心圆形展开新配色。`theme.js` 用旧表面色遮罩与透明遮罩孔实现，持续 720ms；按钮坐标由 `MdSegmentedControl` 通过 `update:modelValue` 的第二个参数传入。WebKit 下 View Transitions API 不可靠，不要换回去。切换期间 `html.surface-switching` 会抑制全局过渡，别加冲突的全局 transition。
4. **工具栏自动隐藏 2.2 秒**：`ui.js` 的 `AUTO_HIDE_DELAY = 2200`；点击阅读画布 / 轻点可唤出。抽屉打开时不自动隐藏。
5. **移动端手势**：横向滑动跟手翻页，带阻尼与回弹；轻点左 30% 上一页、右 30% 下一页、中间切换工具栏。手势层 z-index 必须高于阅读舞台，否则会被图片层拦截。
6. **窄屏强制单页**：`DOUBLE_SPREAD_MIN_WIDTH = 768`，`<768` 即使设置里选了双页也只按单页渲染。
7. **移动端存储降级**：原文件优先 FileSystemFileHandle → OPFS → IndexedDB Blob；导入后检查配额，已用 ≥85% 或剩余 <200MB 时提示。不要删掉这套降级链。
8. **全屏走 Tauri 原生窗口 API**：Windows WebView2 不接管 F11，`ui.js` 的 `toggleFullscreen` 已处理；浏览器调试环境才回退 Fullscreen API。
9. **PDF 资源必须随包分发**：`vite.config.js` 的 `pdfjsAssets` 插件会把 `cmaps / standard_fonts / wasm / iccs` 同步到 `public/pdfjs`。删掉插件会导致 PDF 白屏。`public/pdfjs` 已 gitignore，不要提交。
10. **PDF 渲染约束**：按页懒加载，LRU 缓存 24 页；首次打开默认单页；不支持字号调整与重排。
11. **Markdown 安全**：输出会进 `v-html`，原始 HTML 必须转义，链接/图片只放行 `http/https/mailto/tel` 与相对路径。章节按一级/二级标题切分，并排除代码块内的标题标记。
12. **进度与排版记忆**：翻页、滚轮、条漫滚动、拖进度条都要按书保存，包含方向 / 单双页 / 首页单排 / 字号 / 条漫尺寸。目录与书签目前**没有**持久化，这是已知限制，不要假装已支持。
13. **重对象不进响应式深度代理**：见第 4 节。`PaginatedView` 的双缓冲动画对象尤其不能变成 `ref` 深层代理。

## 7. 常见坑

- 依赖没装就 `npm run dev` 会提示找不到 tauri 命令：先 `npm install`。
- `dist/index.html` 用 `file://` 打开会因相对路径 / IndexedDB 限制而异常，必须走 `http://localhost`。
- PDF 白屏优先查 `public/pdfjs/` 是否生成、控制台是否有 cmaps / standard_fonts 404。
- Tailwind 对 CSS 变量加透明度修饰会失效，改用 `color-mix`。
- 触屏上不要依赖 `:hover` 显示操作按钮；触屏常显，鼠标设备才 hover。
- iOS Safari 不支持文件夹选择与 File System Access API；Android 的系统选择器也选不到目录，`platform.js` 已做降级，不要绕开。
- 本地与 `origin` 分叉时直接 push 会被拒；先 `git pull --rebase`，别强推。
- `.trae/` 是本地 agent 配置，已被 gitignore；不要把其中的 skill / 文档当作仓库内容。
- `.trae-html-share-packages/` 已进 gitignore，但历史上仍跟踪了一个 `homura-ultra.html.zip`；不要继续提交同类产物。
- `design-preview/` 是可交互设计原型和截图，不是生产代码。要改真实界面请改 `src/`，不要把原型当发布物。

## 8. 提交与发布

- 提交信息按 **Conventional Commits**：`feat:` / `fix:` / `perf:` / `refactor:` / `docs:` / `build:` / `ci:` / `chore:`。Release 说明由 `scripts/release-notes.mjs` 按类别自动分组。
- CI 只在推送 `v*` tag 或手动 `workflow_dispatch` 时运行，不响应 main 分支推送。
- 平台产物：macOS Universal `.dmg`、Windows `.msi` / NSIS、Linux **仅 deb + rpm**（不出 AppImage）、Android arm64 debug APK。
- 发版时版本号要同步 3 处：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
- 不要提交：`node_modules/`、`dist/`、`public/pdfjs/`、`src-tauri/target/`、`src-tauri/gen/`、`.trae/`、`.trae-html-share-packages/`、`.DS_Store`。

## 9. 完成定义（Definition of Done）

改动交付前至少确认：

- [ ] `npm run build:vite` 通过，控制台无报错、无 404。
- [ ] 浏览器 390px / 899px / 900px / 1440px 四档宽度下无横向溢出、底部导航和 FAB 不压内容。
- [ ] 白昼 / 护眼 / 夜间三种表面逐屏检查，没有硬编码白字或暗底发灰。
- [ ] 改 UI：10 套主题都能切，外观面板 280px 双行五列，sheet 可关闭，`prefers-reduced-motion` 不崩。
- [ ] 改阅读器：LTR / RTL / 竖排、单页 / 双页、翻页动画、进度恢复都正常。
- [ ] 改导入 / 解析：用真实样本验证对应格式；PDF 需覆盖中文文本与扫描件；Markdown 需测 `<script>` 与 `javascript:` 链接。
- [ ] 改 Tauri / 窗口：跑 `npm run dev`，确认启动不黑屏、标题栏随模式换色、全屏可进出。
- [ ] 新代码里搜不到新增 hex / `rgb(`，没有引入图标库或组件库。
- [ ] 没有提交任何构建产物。

## 10. 去哪里找上下文

- `README.md`：功能、快捷键、构建、已知限制（**项目结构段落过时**）。
- `.trae/skills/homura-md3-ui/`：完整 MD3 规范与 token 表（本地文件，可能不在仓库中）。
- `.trae/documents/`：Vue 3 迁移与进度记忆的历史笔记，可能滞后。
- `design-preview/`：设计原型与各主题截图，用于对照视觉效果。
- `.github/workflows/build.yml`：CI 与各平台打包参数。
</content>
