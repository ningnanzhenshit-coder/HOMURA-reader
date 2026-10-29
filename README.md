<img width="400" height="400" alt="1822a9f2-5767-4a06-9b29-824e91cf59ad" src="https://github.com/user-attachments/assets/a87c9e6a-7b28-4dd3-a3de-e3805930060e" />


# HOMURA — 本地漫画与轻小说阅读器

*（又让本鱼写 README……行吧，反正摸鱼也是摸。）*

HOMURA 是一个**本地优先**的桌面 ACGN 阅读器：漫画、轻小说、图集拖进来就能看，解析和渲染全在本机完成，**不上传任何文件**。基于 Tauri 2 打包，支持 macOS / Windows / Linux。

- 当前版本：**2.1.1**
- 仓库：[ningnanzhenshit-coder/homura-reader](https://github.com/ningnanzhenshit-coder/homura-reader)
- 下载：[Releases](https://github.com/ningnanzhenshit-coder/homura-reader/releases)

---

## 能吃什么格式

| 格式 | 扩展名 | 说明 |
| --- | --- | --- |
| EPUB / KEPUB | `.epub`、`.kepub.epub` | 解析 OPF spine 与章节正文；图片占主导的 EPUB 会自动切成漫画模式 |
| PDF | `.pdf` | 按页按需渲染成位图，保留原始版式；不支持重排与改字号，加密 PDF 暂不支持 |
| 漫画压缩包 | `.cbz`、`.zip` | 提取压缩包内图片，按文件名自然序排序 |
| 纯文本 / Markdown | `.txt`、`.md` | 识别「第 X 章 / Chapter N / 序章 / 尾声」等标题切章；Markdown 按纯文本读取，不渲染语法 |
| 图片文件夹 | `.jpg` `.jpeg` `.png` `.webp` `.gif` `.avif` `.bmp` | 按所在子文件夹分组，一组图 = 一本书 |

导入方式：拖拽文件/文件夹到窗口、点「导入文件」、点「导入文件夹」，或者直接拖整个目录进来。书架为空时还会放两本示例书，打开就能试试手感。

## 阅读手感

- **方向与排版**：左→右、右→左（日漫）、上下条漫，配合单页 / 双页并排；双页模式可以开启「首页单排」，让跨页大图对齐。
- **长文自动分页**：小说按窗口尺寸、字号和可用高度实时分页，改字号（14–28px）或改窗口大小都会重新排。
- **条漫三档尺寸**：完整单张、适中宽幅、超宽满屏。
- **翻页动画**：丝滑平移、柔和淡入、极速无动画，随便挑。
- **视觉主题**：晴空蓝 / 绯红金 / 森系绿 / 星夜紫四种主色，白昼 / 暖色护眼 / 夜间三种阅读表面；护眼模式会给漫画图片加一层柔和的暖色滤镜。
- **顺手操作**：滚轮翻页、键盘翻页；漫画页面懒加载，翻页动画结束后再后台预解码后面几页。
- **书架**：作品元数据、封面和源文件存进本地 IndexedDB，重开自动恢复；可以单本移除或清空。
- **进度与排版记忆**：翻页、滚轮、条漫滚动或拖进度条都会按书记住位置，重开自动回到上次那一页；每本书的阅读方向、单双页、首页单排、字号和条漫尺寸也会一起记住。书架封面底部显示进度条与「读至 N%」。

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `←` / `→` | 上一页 / 下一页（日漫右→左模式下按钮方向会反转） |
| `Space` | 下一页 |
| `↑` / `↓` | 上一页 / 下一页 |
| `Esc` | 关闭阅读器回到书架 |
| `F` | 进入 / 退出全屏（Tauri 原生窗口全屏，Windows 下有效） |

条漫模式不用按键，滚轮或触控板直接往下滑；小说模式滑动底部进度条也能跳页。

## 下载即用

到 [Releases](https://github.com/ningnanzhenshit-coder/homura-reader/releases) 找对应平台的包：

| 平台 | 安装包 |
| --- | --- |
| macOS | `.dmg`（Universal，Apple Silicon + Intel） |
| Windows | `.msi` 或 NSIS `-setup.exe` |
| Linux | `.deb` / `.rpm` |
| Android | `.apk`（arm64-v8a，debug 签名，需允许安装未知来源应用） |

> **macOS 首次打开**：当前包没有 Apple 开发者签名，系统可能提示「无法验证开发者」。右键 `HOMURA.app` → 打开，或执行 `xattr -cr /Applications/HOMURA.app` 即可。
>
> **Android 说明**：APK 为 debug 签名，安装时需允许「未知来源应用」。移动端请用「导入文件」多选 EPUB / CBZ / ZIP / TXT / 图片；拖拽与文件夹导入仅桌面端可用。

## 从源码构建

需要 Node.js 22+、Rust stable（≥ 1.77.2）以及对应平台的 Tauri 依赖：macOS 装 Xcode Command Line Tools；Linux 装 `libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`；Windows 装 WebView2 与 MSVC 构建工具。

```bash
npm install
npm run dev      # 生成 dist/ 并启动 Tauri 开发窗口
npm run build    # 打包安装包
```

构建产物在 `src-tauri/target/release/bundle/`。

> 前端经 Vite 构建，`dist/index.html` 不能直接双击用 `file://` 打开；请用 `npm run dev`，或在 `dist/` 目录下起一个本地静态服务器再访问。

常用脚本：

| 命令 | 作用 |
| --- | --- |
| `npm run dev:vite` | 启动 Vite 开发服务器（HMR，端口 5173） |
| `npm run build:vite` | 用 Vite 把前端打包进 `dist/` |
| `npm run dev` | `dev:vite` + `tauri dev` |
| `npm run build` | `build:vite` + `tauri build` |

## 项目结构

```text
homura-reader/
├── index.html             # Vite 入口（保留防闪白内联脚本与 Tailwind 运行时）
├── vite.config.js         # Vite 配置（Vue 插件 + 相对路径 base）
├── src/
│   ├── main.js            # createApp + createPinia + 挂载
│   ├── App.vue            # 总布局：Header / 书架 / ReaderModal / Toast / 分页测量器
│   ├── assets/homura.css  # 主题变量、阅读表面、动效
│   ├── stores/            # Pinia：theme（主题色/表面/过渡）、shelf（书架/进度）、reader（阅读器状态与翻页动作）
│   ├── services/          # 纯逻辑无 DOM：storage（IndexedDB）、parsers（EPUB/CBZ/TXT）、pagination（智能分页）、progress（进度记忆）、restore（存档恢复）、demo（示例书）
│   ├── composables/       # useImporter（导入）、useShortcuts（键盘/滚轮）、useToast
│   └── components/        # AppHeader / DropZone / BookShelf / BookCard / ReaderModal / ReaderToolbar / ReaderBottomBar / PaginatedView（双缓冲引擎）/ WebtoonView / NovelCard / AppToast
├── scripts/
│   └── release-notes.mjs  # 用 Conventional Commits 生成 Release 说明
├── src-tauri/             # Tauri 2 壳、图标与打包配置
├── dist/                  # Vite 构建产物（已 gitignore）
└── .github/workflows/     # 三平台自动打包
```

技术栈：Vue 3 + Pinia + Vite，UI 保留手写 Tailwind（运行时内置，断网可用）与 CSS 变量主题，JSZip 走 npm 依赖，桌面壳用 Tauri 2（Rust）。双缓冲翻页引擎在 `PaginatedView.vue` 内直操作 ref DOM + Web Animations API，不经过响应式重渲染。

## 数据与隐私

- 书架数据存在本机 IndexedDB 数据库 `homura_shelf`，分 `books`（元数据 + 封面）、`sources`（原始文件）和 `progress`（每本书的阅读进度）三栏。
- 支持文件句柄时会优先保存句柄，尽量不占本地存储；不支持时退化为保存原始 Blob。
- 阅读主题和明暗模式记在 `localStorage`，只有两个键。
- 应用不联网读取书籍、不上传文件；清除应用本地数据会一起清掉书架，卸载前记得留好原始文件。
- 阅读进度与每本书的排版设置（方向 / 单双页 / 首页单排 / 字号 / 条漫尺寸）持久化在 `progress` 栏，进度按比例记录，所以改窗口大小或字号后仍能回到同一段内容；目录和书签目前**没有**做持久化。

## 已知限制

- 安装包未做 Apple 签名 / 公证，macOS 首次打开需要手动放行。
- 桌面 WebView 不支持文件句柄时会走 Blob 存档，大图集会占用更多本地空间。
- EPUB 的复杂排版、固定版式、自定义字体不会完整还原，正文按自定义规则重新分页。
- 暂不支持目录跳转与书签；进度按整本比例记忆，极端情况下（书籍内容大改）可能略有偏差。
- 字体来自 Google Fonts，完全断网时会回退到系统字体；Tailwind 和 JSZip 已内置，不受影响。

## 开发与发布

推 `v*` 标签会触发 [build.yml](.github/workflows/build.yml)：macOS Universal、Linux、Windows 三平台并行构建，自动生成草稿 Release，并用 Conventional Commits 汇总更新日志；手动 `workflow_dispatch` 只上传构建产物（保留 14 天）。

提交信息按 Conventional Commits 写（`feat:` / `fix:` / `perf:` / `refactor:` / `docs:` / `build:` 等），Release 说明会按类别自动分组。发版提交本身会被过滤掉。

## 许可

仓库暂未附带 LICENSE 文件。在明确许可前，请勿直接商用或再分发；有需要先联系作者确认。

*（README 写完了，本鱼先去吃小鱼干了。有问题提 issue，别私信戳我，戳也装死。）* 🐋
