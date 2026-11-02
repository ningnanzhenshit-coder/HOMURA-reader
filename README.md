<img width="400" height="400" alt="Untitled-1 - 02-11-2026 19-19-50" src="https://github.com/user-attachments/assets/818e7aba-f12a-49e1-8640-8852cb852b8b" />

# HOMURA — 本地漫画与轻小说阅读器

> 本鱼只负责把书塞进你的本地书架；上传云端那种事，想都别想。🐋

HOMURA（ACGN GO）是一个**本地优先**的 ACGN 阅读器：漫画、轻小说、PDF 和图集导入后即可阅读，解析、分页与渲染全部在本机完成，书籍内容不会上传。桌面端使用 Tauri 2 打包，同一套前端也提供 Android 构建。

- 当前版本：**2.1.7**
- 技术栈：Vue 3 + Pinia + Vite 6 + Tauri 2（纯 JavaScript）
- 仓库：[ningnanzhenshit-coder/homura-reader](https://github.com/ningnanzhenshit-coder/homura-reader)
- 下载：[GitHub Releases](https://github.com/ningnanzhenshit-coder/homura-reader/releases)

## 项目现状

| 项目 | 当前状态 |
| --- | --- |
| 发布版本 | `2.1.7`，`package.json`、`Cargo.toml`、`tauri.conf.json` 三处版本一致 |
| 桌面平台 | macOS / Windows / Linux |
| 移动平台 | Android arm64-v8a APK |
| 核心链路 | 导入、本地存档、恢复、分页/滚动阅读、目录跳转、进度记忆均可用 |
| 尚未完成 | 标签、侧栏设置仍是占位入口；书签尚未实现 |
| 质量保障 | 仓库暂无自动化测试、ESLint 或 TypeScript，以构建检查和手动回归为主 |
| 许可 | 尚未添加 `LICENSE` 文件 |

## 功能概览

- **多格式书架**：EPUB / KEPUB、PDF、MOBI、CBZ / ZIP、TXT、Markdown 和图片文件夹。
- **两种阅读方式**：小说使用自动分页引擎；漫画支持单页、双页、首页单排和上下条漫。
- **本地进度记忆**：按书保存页码、阅读比例、方向、单双页、字号和条漫尺寸，重开自动续读。
- **Material Design 3 界面**：10 套主题色、白昼 / 护眼 / 夜间三种表面，桌面与窄屏分别适配。
- **离线书库**：书籍元数据、封面、原文件与进度都保存在本机；应用不同步或上传书籍内容。

## 支持格式

| 格式 | 扩展名 | 当前能力 |
| --- | --- | --- |
| EPUB / KEPUB | `.epub`、`.kepub.epub` | 读取 OPF spine 与章节正文；图片占主导的 EPUB 会自动按漫画阅读 |
| PDF | `.pdf` | 按页懒加载并渲染为位图，保留原始版式；不支持重排或改字号，加密 PDF 暂不支持 |
| MOBI | `.mobi`、`.prc`、`.azw` | 解析 PalmDOC 容器，提取正文、封面与内嵌图片；不支持 DRM、AZW3 / KF8 和 Huffman 压缩 |
| 漫画压缩包 | `.cbz`、`.zip` | 提取图片并按文件名自然序排列，文件夹图片也可导入 |
| 纯文本 / Markdown | `.txt`、`.md` | TXT 兼容 UTF-8、GBK / GB18030、带 BOM 的 UTF-16 及有明显零字节特征的无 BOM UTF-16，按常见章节标题切分；Markdown 按一级/二级标题切章并渲染常见 GFM 内容 |
| 图片文件夹 | `.jpg`、`.jpeg`、`.png`、`.webp`、`.gif`、`.avif`、`.bmp` | 按所在子文件夹分组，一组图片视为一本漫画 |

Markdown 输出会经过安全处理：原始 HTML 只作为文本显示，链接和图片仅放行相对路径与 `http`、`https`、`mailto`、`tel` 协议。

## 导入与书架

- 点击右下角「导入」选择文件或文件夹；桌面端还支持把文件、目录直接拖进窗口。
- 文件选择支持多选，一次可以连续导入多种格式。Android 的系统文件选择器只接受文件，不提供文件夹入口；iOS Safari 也不支持目录选择。
- 图片文件夹会按子目录自动拆成多本书；空书架首次启动时会放入示例漫画与示例轻小说。
- 「新建」可建立自定义一级书库；支持拖入书本、多选移入、跨库移动与移回主页。每本书只属于一个书库，删除书库会将书本放回主页，保留原文件和阅读进度。
- 书库始终排在单本前；文件夹外观显示库内排序的第一本封面及后面最多三本的薄叠影，不足的叠影以主题色补齐。
- 导入包含多本作品的文件夹时，可以选择按目录分别创建书库，逐个确认名称；深层目录也会展平为独立书库，不建立嵌套书库。在书库中导入单独文件会归入当前书库。
- 书架与收藏支持类型筛选（全部 / 漫画 / 轻小说 / 其他），PDF 及不属于漫画、小说的书归入「其他」；还支持格式筛选（EPUB / PDF / MOBI / TXT / Markdown）和三种排序（书名 / 最近添加 / 阅读进度）。默认按书名排序：数字按自然顺序排列，中文按拼音与英文字母混排。
- 主页在同一个网格中紧接排列「继续阅读 → 书库 → 小说 → 漫画 → 其他」，不显示分类标题、不按类别强制换行；同类书本沿用所选排序，PDF 放在「其他」。继续阅读也可直接返回书库内上次阅读的作品。
- 阅读器顶栏「本目录」右侧的星星可收藏 / 取消收藏本书，独立书本也支持收藏。导航中的「收藏」平铺展示所有已收藏书本（包含库内书本），支持排序、搜索和格式筛选，不显示继续阅读卡或书库；导入书籍的收藏重启后保留，示例书收藏随本次示例保留。
- 收藏页卡片的移除按钮仅取消收藏，保留原书、书库归属和阅读进度；书架中的移除按钮仍用于删除书本。继续阅读卡片会在原有左侧窄栏中裁切展示封面，并向右渐变融入背景，不改变卡片尺寸；无封面时保留文字书脊。
- 点击桌面左上角的 HOMURA 主图标可返回主页，同时退出当前书库、多选和筛选，恢复默认书名排序。
- 导入与书架中已有作品同名的书本时，会提示确认，默认跳过，也可选择「仍然导入」保留独立版本。同批次导入也会检查重名，识别时忽略英文大小写、首尾空白及全半角差异，以解析后的书名为准。
- 搜索支持书名和书库名称；界面占位文案中的作者搜索尚未实现。
- 可以单本移除或清空书架。清除应用数据会同时删除本地书架记录。
- 标签和侧栏设置仍是占位入口。

## 阅读器

### 布局与操作

- 阅读方向支持左到右、右到左（日漫）和上下条漫。
- 漫画支持单页 / 双页与「首页单排」；窗口宽度小于 `768px` 时强制按单页显示。
- 小说字号可在 `12–48px` 之间输入数值、拖动滑块或逐级调整；每页行数随窗口与字号自动重新计算，长段落也会继续分页，按书保留字号和阅读进度。
- 阅读设置最下方可选择本地图片作为自定义封面，支持恢复原封面；书架、继续阅读与书库封面同步更新，导入书籍的封面重启后保留，不修改原书文件。示例书封面仅在本次打开期间保留。
- 阅读设置面板仅在内容超出可用高度时显示滚动条。
- 条漫提供完整单张、适中宽幅、超宽满屏三档尺寸。
- 翻页动画可选丝滑平移、柔和淡入和极速无动画。
- 阅读工具栏在无操作 2.2 秒后自动隐藏；设置抽屉或目录抽屉打开时不会自动隐藏。
- 阅读书库内作品时，顶部「本目录」按进入阅读器时的书库顺序显示所有书本，并高亮当前书本。末页继续向后翻会打开下一本首页，首页向前翻会打开上一本末页；首本和末本不循环。鼠标、触屏、键盘和底栏翻页按钮共用此规则，单本不启用跨书阅读。
- 鼠标和触屏均支持横向跟手翻页；短点在松手时生效：画布左侧 25% 与左方向键一致，右侧 25% 与右方向键一致，中间 50% 切换工具栏。长按达到 300ms 或移动达到 8px 后不再视为点击，滑动不足翻页距离会回弹。
- 目录支持漫画页码与小说/EPUB 章节跳转；目录状态不会持久化，书签功能尚未实现。

### 主题与表面

10 套主题色：森系绿、薄荷青、海盐青、深海蓝（默认）、鸢尾紫、兰花紫、樱雾粉、落日赤陶、琥珀金、橄榄青。

三种阅读表面：白昼、护眼、夜间。护眼模式会给漫画图片叠加柔和暖色滤镜；切换背景时会同步更新原生窗口标题栏和窗口底色。

### 快捷键

| 按键 | 作用 |
| --- | --- |
| `←` / `→` | 上一页 / 下一页；右到左模式会反转翻页方向 |
| `Space` | 下一页 |
| `↑` / `↓` | 上一页 / 下一页 |
| `Esc` | 依次关闭设置/目录、唤出工具栏、退出阅读器 |
| `F` | 进入 / 退出全屏；桌面端走 Tauri 原生窗口 API |

条漫模式保留原生纵向滚动，不使用左右翻页快捷键。输入框获得焦点时，键盘快捷键会自动让位。

## 下载与安装

到 [GitHub Releases](https://github.com/ningnanzhenshit-coder/homura-reader/releases) 下载对应安装包：

| 平台 | 发布产物 |
| --- | --- |
| macOS | `.dmg`，Universal 构建，支持 Apple Silicon 与 Intel；最低系统版本 10.15 |
| Windows | `.msi` 或 NSIS `-setup.exe` |
| Linux | 仅 `.deb` 与 `.rpm` |
| Android | `.apk`，arm64-v8a，release keystore 签名 |

> **macOS**：当前安装包没有 Apple 开发者签名与公证，首次打开可能需要右键 `HOMURA.app` →「打开」，或执行 `xattr -cr /Applications/HOMURA.app`。
>
> **Android**：安装 release APK 时需要允许「安装未知来源应用」。debug 签名版本不能与 release 版本覆盖升级，切换前请先卸载旧版。

## 从源码构建

### 环境要求

- Node.js 22+
- Rust stable ≥ 1.77.2
- 对应平台的 Tauri 2 构建依赖

macOS 需要 Xcode Command Line Tools；Windows 需要 WebView2 与 MSVC 构建工具；Linux 需要 WebKitGTK 4.1、AppIndicator、librsvg 和 patchelf。以 Ubuntu 为例：

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

### 常用命令

```bash
npm install
npm run dev        # tauri dev，Tauri 会自动执行 Vite 开发前置命令
npm run build      # tauri build，Tauri 会先构建前端再打包安装包
```

| 命令 | 作用 |
| --- | --- |
| `npm test` | 验证书名排序、同名识别、书库归属、目录分组和阅读手势规则 |
| `npm run dev:vite` | 只启动 Vite 开发服务器，端口固定为 `5173`，支持 HMR |
| `npm run build:vite` | 只构建前端到 `dist/`，是最快的构建验证 |
| `npm run dev` | 启动 Tauri 开发窗口；`beforeDevCommand` 自动运行 Vite |
| `npm run build` | 构建桌面安装包；`beforeBuildCommand` 自动构建前端 |
| `npm run icons:generate` | 从 `src-tauri/app-icon.png` 母版生成各平台图标，并同步网页、启动页和已初始化的 Android 工程 |
| `npm run android:init` | 初始化 Android 工程 |
| `npm run android:dev` | 运行 Android 开发版 |
| `npm run android:build` | 构建 Android arm64 release APK，需要本地 release keystore |
| `npm run android:build:debug` | 构建 Android arm64 debug APK |

桌面构建产物位于 `src-tauri/target/release/bundle/`。Vite 资源通过相对路径加载，不能直接双击 `dist/index.html` 以 `file://` 打开；请使用开发服务器或本地静态服务器。

`vite.config.js` 中的 PDF 资源同步插件会把 cmaps、标准字体、wasm 和 ICC 资源复制到 `public/pdfjs/`。该目录是构建产物并已加入 `.gitignore`，不要提交。

## 项目结构

```text
homura-reader/
├── index.html                  # Vite 入口，首帧前同步恢复主题
├── vite.config.js              # Vue 插件、相对路径 base、PDF 资源同步
├── AGENTS.md                   # 项目协作与实现约束
├── src/
│   ├── main.js                 # createApp + Pinia
│   ├── App.vue                 # 书架布局、导入入口、离屏分页测量器
│   ├── assets/homura.css       # MD3 token、阅读表面、组件样式与动效
│   ├── stores/
│   │   ├── theme.js            # 10 套主题色、3 种表面、翻页过渡
│   │   ├── shelf.js            # 书架、进度映射、示例书、IndexedDB 恢复
│   │   ├── reader.js           # 当前书籍、分页状态、阅读动作
│   │   └── ui.js               # 阅读器工具栏、目录、设置与全屏状态
│   ├── services/
│   │   ├── parsers.js          # EPUB / CBZ / ZIP / TXT / MD / PDF / MOBI 总入口
│   │   ├── pagination.js       # 小说智能分页、章节与图片页构建
│   │   ├── pdf.js              # PDF 懒加载、页面位图与 LRU 缓存
│   │   ├── mobi.js             # PalmDOC / MOBI 解析
│   │   ├── markdown.js         # marked + 安全渲染
│   │   ├── storage.js          # IndexedDB homura_shelf
│   │   ├── opfs.js             # Origin Private File System 原文件存储
│   │   ├── restore.js          # 原生 AppData / OPFS / 句柄 / Blob 存档恢复
│   │   ├── nativeStorage.js    # Android 原生 AppData 原文件存储
│   │   └── progress.js         # 阅读进度与排版记忆、节流落盘
│   ├── composables/            # 导入、快捷键、视口、抽屉拖拽
│   └── components/             # SideNav、LibraryHeader、BookShelf、BookCard、
│                               # ReaderModal、PaginatedView、WebtoonView、
│                               # ReaderTocDrawer、ReaderSettingsDrawer 等
├── src-tauri/                  # Tauri 2 壳、权限、图标与打包配置
├── public/vendor/              # 内置 Tailwind 运行时，断网可用
├── scripts/release-notes.mjs   # Conventional Commits → Release 说明
├── design-preview/             # 设计原型与截图，不是生产代码
└── .github/workflows/build.yml # 三平台桌面与 Android 自动构建
```

PDF、Markdown 安全渲染和分页测量需要 DOM / Canvas，因此 `services/` 并非全部是纯逻辑模块；`stores/` 负责状态与动作，`components/` 负责视图与交互。翻页引擎 `PaginatedView.vue` 与 `WebtoonView.vue` 直接操作 DOM 和 Web Animations API，不通过 `v-for` 重渲染翻页画面。

## 本地存储与隐私

- IndexedDB 数据库名为 `homura_shelf`，包含 `books`、`sources`、`progress`、`collections` 四个对象仓库，分别保存书籍元数据/封面、原始文件来源、阅读进度以及书库与书本归属；旧书架会自动升级。
- 原始文件在 Android Tauri 包中优先写入应用私有 AppData，失败再保留 IndexedDB Blob；其余平台优先保存 `FileSystemFileHandle`，无句柄时写入 OPFS，OPFS 不可用才回落到 IndexedDB Blob。读取时会从原生 AppData、OPFS、句柄、Blob 逐层恢复。
- 导入后会检查存储配额；已用空间达到 85% 或剩余不足 200 MB 时会提示。
- 阅读进度写入做了 350 ms 防抖，并在关闭阅读器、页面卸载或切到后台时补写。
- `localStorage` 只保存 `homura_theme_color` 和 `homura_surface_mode` 两个主题偏好；翻页过渡样式不持久化。
- 每本书会记住阅读方向、单双页、首页单排、字号和条漫尺寸；目录状态不会持久化，书签功能尚未实现。
- 应用不上传书籍内容，也没有云同步。清除应用本地数据会一起清掉书架记录，重要文件请保留原始副本。
- Google Fonts 需要联网，完全断网时会回退到系统字体；Tailwind 运行时已随应用分发，PDF 资源也随包构建。

## 已知限制

- 不支持 DRM 加密书籍、AZW3 / KF8、旧版 Huffman 压缩 MOBI 和加密 PDF。
- PDF 按固定版式渲染，不能改字号或重排；EPUB 的固定版式、复杂 CSS 和自定义字体也不能完整还原。
- 目录可以跳转，但目录状态不保存；书签功能尚未实现。
- 书架搜索只匹配书名，标签和侧栏设置仍是占位功能。
- macOS 安装包尚未签名/公证，首次启动需要手动放行。
- 项目提供书名排序、同名识别、书库归属、目录分组和手势判定的单元测试，尚未覆盖完整阅读流程；没有 ESLint 和 TypeScript，改动后仍需执行构建并手动回归关键阅读流程。

## 开发与发布

开发和代码约束以仓库根目录的 [`AGENTS.md`](AGENTS.md) 为准。提交前至少运行：

```bash
npm test
npm run build:vite
```

提交信息使用 Conventional Commits：`feat:`、`fix:`、`perf:`、`refactor:`、`docs:`、`build:`、`ci:`、`chore:`。发版时需同步修改以下三处版本号：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

CI 只在推送 `v*` 标签或手动触发 `workflow_dispatch` 时运行，不响应普通 `main` 分支推送：

- **macOS**：Universal `.dmg`
- **Windows**：`.msi` / NSIS
- **Linux**：仅 `.deb` 和 `.rpm`
- **Android**：arm64-v8a release APK，使用 GitHub Secrets 中的 keystore 签名

推送版本标签会创建草稿 Release，并把桌面安装包与 APK 一并上传；手动触发只保留构建产物 14 天。Release 说明由 `scripts/release-notes.mjs` 按提交类别自动生成。

## 反馈

发现 bug、格式兼容问题或有功能建议，请到 [Issues](https://github.com/ningnanzhenshit-coder/homura-reader/issues) 提交。反馈解析问题时可附上格式、复现步骤和必要的脱敏样本，别把带版权或隐私的原书直接扔进公开仓库。

## 许可

仓库目前没有附带 `LICENSE` 文件，不能默认视为开源授权。使用、修改或分发前请先联系作者确认。

---

*README 按 v2.1.7 当前实现整理。功能状态以代码为准；本鱼写完先去吃小鱼干了。* 🐋
