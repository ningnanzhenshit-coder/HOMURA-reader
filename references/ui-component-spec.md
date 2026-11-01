# HOMURA UI 组件规范

> 适用版本：HOMURA `2.1.4`  
> 适用范围：`src/` 内所有生产界面，包括书架、阅读器、设置面板、菜单、弹层与全局反馈。  
> 不适用：`design-preview/` 原型、README 配图与一次性演示页。

本文定义 HOMURA 新增、修改和审查 UI 组件时的最低要求。颜色全表见
[tokens.md](./tokens.md)，项目协作约束见 [AGENTS.md](../AGENTS.md)。

规范关键词按以下含义使用：

- **必须**：不满足即不能合入。
- **应该**：默认执行；如有例外，需要在代码或评审中说明原因。
- **可以**：按具体场景选择。
- **禁止**：不得新增或扩散到新代码。

当前代码与本文不一致时，以现有产品行为、`AGENTS.md` 和 `src/` 为准；本文用于约束后续改动，
不要求在无关任务中批量重写存量实现。

## 目录

1. [设计目标](#1-设计目标)
2. [不可破坏的基线](#2-不可破坏的基线)
3. [设计基础](#3-设计基础)
4. [响应式布局](#4-响应式布局)
5. [组件状态模型](#5-组件状态模型)
6. [通用操作组件](#6-通用操作组件)
7. [卡片与内容展示](#7-卡片与内容展示)
8. [导航与页面头部](#8-导航与页面头部)
9. [浮层、抽屉与确认](#9-浮层抽屉与确认)
10. [主题相关组件](#10-主题相关组件)
11. [阅读器组件](#11-阅读器组件)
12. [全局反馈与系统界面](#12-全局反馈与系统界面)
13. [可访问性与内容规范](#13-可访问性与内容规范)
14. [Vue 实现约定](#14-vue-实现约定)
15. [评审与验收](#15-评审与验收)
16. [变更流程](#16-变更流程)

## 1. 设计目标

HOMURA 是一个本地优先、内容优先的 ACGN 阅读器。界面首先服务于“找到作品”和“进入阅读”，
不是展示装饰、堆叠功能或模仿通用后台模板。

所有组件必须满足以下五个目标：

1. **沉浸但不神秘**：层级清楚，主要动作明确，用户随时知道当前位置和返回路径。
2. **内容优先**：封面、书名、正文和漫画画面拥有最高视觉权重，控件不能抢戏。
3. **安静且可恢复**：可恢复错误不打断阅读；不新增 toast、`alert` 或阻塞式弹窗。
4. **跨表面一致**：10 套主题色 × 白昼 / 护眼 / 夜间三种表面下都成立。
5. **桌面与触屏同源**：同一组件响应式适配，不维护两套互不一致的视觉语言。

## 2. 不可破坏的基线

以下规则适用于任何 UI 任务：

- 颜色只能来自 `--md-*` token；禁止新增十六进制色、`rgb()`、纯黑或纯白。
- 派生色使用 `color-mix(in oklab, var(--md-x) NN%, transparent)`，不要依赖 Tailwind
  对 CSS 变量的透明度修饰。
- 一屏只保留一个 `primary` 实心主行动。书架页唯一主行动是「导入」FAB。
- 布局主断点只有 **900px**。`<900` 使用底部导航与 bottom sheet，`>=900` 使用
  Navigation Rail 与 side sheet。
- 图标全部内联 SVG；禁止引入图标库、组件库或远程字体来补 UI。
- 图标按钮必须有 `title` 或 `aria-label`；交互元素必须是原生 `button` / `a` / 表单控件。
- 禁止用 `<div @click>` 冒充按钮，禁止把可交互控件嵌套在另一个可交互控件里。
- 重对象必须使用 `shallowRef` 或普通非响应式变量，尤其是 `File`、Zip 内容、动画对象、
  timer 与 DOM 引用。
- 全局 toast 已移除；禁止重新引入 toast、`alert` 或自绘全局消息条。可恢复错误写入 console。
- 新代码直接使用 `--md-*`；禁止新增 `--brand-*`、`--bg-*`、`--fg-*` 等遗留别名。

## 3. 设计基础

### 3.1 颜色角色

每个背景色必须与其对应的 `on-*` 前景色成对使用。不要只根据白昼模式挑颜色。

| 用途 | 背景 token | 前景 token | 典型组件 |
| --- | --- | --- | --- |
| 页面画布、顶栏、浮动工具栏 | `surface` | `on-surface` | 书架背景、阅读器顶栏/底栏 |
| Rail、阅读纸张、次级卡片 | `surface-low` | `on-surface` | Navigation Rail、阅读卡 |
| 菜单、sheet、浮动面板 | `surface-container` | `on-surface` | 外观面板、目录、阅读设置 |
| 搜索框、输入槽、次要按钮底 | `surface-high` | `on-surface` | 搜索胶囊、字号按钮 |
| 更深一阶的中性表面 | `surface-highest` | `on-surface` | 搜索框焦点底、按压反馈 |
| 主行动 | `primary` | `on-primary` | 导入 FAB、完成按钮、当前进度 |
| 选中项、特色卡、指标容器 | `primary-container` | `on-primary-container` | 继续阅读、当前章节、当前导航项 |
| 筛选 chip、数量胶囊 | `secondary-container` | `on-secondary-container` | 类型筛选、作品数量 |
| 少量点缀 | `tertiary-container` | `on-tertiary-container` | 装饰性预览、标签 |
| 正文 | 透明或对应容器 | `on-surface` | 标题、正文、菜单主标签 |
| 次要文字 | 透明或对应容器 | `on-surface-variant` | 说明、分组标签、元信息 |
| 分隔线、控件边框 | 透明 | `outline-variant` | 0.5px 分割线、卡片环 |
| 强调描边 | 透明 | `outline` | 需要更高对比度的边界 |
| 遮罩 | `color-mix(... on-surface ...)` | 不适用 | `.md-scrim`、`.md-scrim-soft` |

颜色使用补充规则：

- 选中态优先使用 `primary-container` + `on-primary-container`，不要到处铺实心 `primary`。
- `primary` 实心块上的文字必须使用 `on-primary`；不能用 `on-surface` 猜测对比度。
- 删除、清空等高风险动作必须用明确文案表达后果，不依赖私自发明的“错误红”。
- 阴影和渐变中的透明色可以使用，但主色仍必须来自 token 或基于 token 的 `color-mix`。
- 禁用态仍应保留可识别轮廓；不要用接近不可见的整体透明度掩盖重要文案。

推荐写法：

```html
<div class="bg-[var(--md-surface-container)] text-[var(--md-on-surface)]">
  <span class="text-[var(--md-on-surface-variant)]">次要说明</span>
</div>
```

禁止写法：

```html
<div class="bg-white text-black">
  <span class="text-[#666]">次要说明</span>
</div>
```

### 3.2 主题与表面

主题色由根节点 `data-theme` 控制：

`green / mint / cyan / blue / violet / orchid / sakura / red / amber / olive`

表面由根节点 `data-mode` 控制：

`light / warm / dark`

组件必须通过 `theme.setThemeColor()` 与 `theme.setSurfaceMode()` 切换，不得自行修改根节点，
也不得在局部容器伪造主题。外观浮层和阅读设置必须共用 `ThemeSwatchGrid.vue` 与
`SurfaceModePreview.vue`，不要再复制色板或模式数组。

表面切换的圆形 reveal 动画、720ms 时长、原生标题栏同步和 `surface-switching` 过渡抑制都在
`src/stores/theme.js`。组件不得叠加冲突的全局过渡。

### 3.3 字体

| 角色 | 字体族 | 使用范围 |
| --- | --- | --- |
| 正文与 UI | `font-sans` | 标题、按钮、正文、表单、说明 |
| 书封与展示标题 | `font-display` | 书封、继续阅读标题、空态标题 |
| 元信息 | `font-mono` | 页数、章节、百分比、快捷键、英文 kicker |
| 竖排书封 | `'Songti SC', 'Instrument Serif', serif` | 仅竖排封面标题 |

字体使用规则：

- 数字型元信息应同时使用 `font-mono` 和 `tabular-nums`，避免进度变化时跳动。
- 英文 kicker 可以使用大写与字距，但不得替代中文主标签。
- 次要信息优先通过 `on-surface-variant` 降级，而不是继续减小字号或字重。
- 禁止通过 `@font-face` 或 CDN 临时引入新字体；当前打包环境必须断网可用。

### 3.4 字号与字重

| 层级 | 规范字号 | 默认字重 | 使用位置 |
| --- | --- | --- | --- |
| 页面标题 | 桌面 22 / 手机 21 | 500 | 书架等主页面 |
| Sheet 标题 | 17 | 600 | 阅读设置、目录、外观 |
| 正文、输入、主按钮 | 13 | 400–600 | 搜索、主行动、说明 |
| 紧凑控件文字 | 12 | 600 | 菜单项、开关行、页码 |
| 分组标签 | 11 | 600 | 设置分组、菜单分组 |
| Chip | 11.5 | 500 | 类型与格式筛选 |
| 分段控件 | 10.5 | 600 | 单页/双页、阅读方向 |
| 元信息、徽章 | 8–8.5 | 500–600 | 书卡元信息、极小辅助标签 |

禁止随手插入 14 / 15 / 16px 等中间档。存量组件中已经存在的 12px 元信息属于历史密度选择，
只在重做该组件时按上表逐步收敛；新增组件不得再扩大字号档位。

### 3.5 间距、尺寸与圆角

间距以 4px 为主节奏，允许 2px 用于描边与视觉校正，允许 10 / 22 / 28px 作为既有组件的光学校正值。
新组件应优先复用以下尺寸：

| 项目 | 规范值 |
| --- | --- |
| 最小触控命中区 | `44px × 44px` |
| 常规图标 | 20px；小图标 14–16px |
| 常规图标按钮 | 44px 正方形或圆形 |
| 紧凑关闭按钮 | 视觉 40px，命中区至少 44px |
| 手机顶栏 | 56px 高 |
| 桌面顶栏 | 64px 高 |
| 手机底部导航 | `calc(5rem + env(safe-area-inset-bottom))` |
| 桌面 Navigation Rail | 96px 宽 |
| 阅读器底栏 | 手机 72px / 桌面 80px |
| 桌面设置 side sheet | 372px 宽 |
| 目录 side sheet | 320px 宽，最大 88% |
| 桌面外观浮层 | 280px 宽 |
| 手机 bottom sheet | 最大 `78dvh` |
| Bottom sheet 拖拽条 | `32px × 4px` |

| 圆角 | 使用范围 |
| --- | --- |
| 8px | 紧凑按钮、分段 chip、小型页码格 |
| 10px | 菜单条目 |
| 12px | 编辑式卡片、特殊插画卡 |
| 16px | 书架卡、特色卡、sheet 内卡片 |
| 20px | 分段控件、桌面外观浮层 |
| 28px | 桌面 side sheet 与手机 bottom sheet |
| `999px` | 胶囊、圆形图标按钮、滑条拇指 |

卡片、菜单和 sheet 不得混用相近但不一致的圆角。需要新圆角档位时，应先确认无法复用现有档位。

### 3.6 动效

动效 token 定义在 `src/assets/homura.css`：

| Token | 值 / 用途 |
| --- | --- |
| `--md-ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)`，默认进出场与位移 |
| `--md-ease-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)`，颜色与开始后落位 |
| `--md-ease-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)`，快速退场 |
| `--md-ease-expressive` | `cubic-bezier(0.16, 1.22, 0.3, 1)`，分段胶囊滑块 |
| `--md-ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)`，开关滑块 |
| `--md-duration-short` | 200ms，颜色、透明度、常规进出场 |
| `--md-duration-medium` | 280ms，短距位移、卡片 hover |

规则：

- 常规交互统一 200ms；卡片 hover 最长 280ms。
- 只过渡颜色、透明度、位移、阴影和 transform；禁止给宽高、padding、grid 等布局属性加 transition。
- Sheet 使用 `.md-sheet-enter-active` / `.md-sheet-leave-active`，淡入遮罩使用 `.md-fade-*`。
- `prefers-reduced-motion: reduce` 下必须关闭非必要位移与动画，并保留最终状态。
- 表面切换 720ms 与阅读器预测式返回是系统级例外，不在普通组件里复制。
- 高频手势期间直接写 DOM style 或使用 Web Animations API，不让每一帧触发 Vue 响应式重渲染。

### 3.7 层级

| z-index | 用途 |
| --- | --- |
| 20 | Sticky 顶栏、页内下拉菜单的点击背板 |
| 30 | Navigation Rail、页内菜单、阅读器顶部/底部工具栏 |
| 40 | 手机底部导航、遮罩、FAB |
| 45 | 阅读器预测式返回遮罩（专用） |
| 50 | Side sheet、bottom sheet、阅读器整屏层 |
| 60 | 全窗拖拽导入遮罩 |
| 9999 | 表面切换 reveal（专用） |
| 10000 | 启动 Splash（专用） |

新增普通浮层必须沿用现有层级，不得为了“保险”直接写 `z-[999]`。专用层只能在对应系统能力内使用。

## 4. 响应式布局

### 4.1 断点

| 范围 | 名称 | 布局 |
| --- | --- | --- |
| `<= 767px` | Phone | 手机布局；底部导航、bottom sheet、安全区 |
| `768–899px` | Compact Tablet | 仍属紧凑布局；书架使用 5 列 |
| `>= 900px` | Desktop | Navigation Rail + 主列 + side sheet |
| `>= 1600px` | Wide Desktop | 书架增至 8 列，限制卡片被拉成相框 |

`isCompact` 与 Tailwind `min-[900px]:` 必须表达同一条主断点。`isPhone`、`isTablet`、`isDesktop`
只能用于安全区、密度、能力差异等细节，不能成为第二套布局体系。

### 4.2 桌面骨架

```text
┌──────────┬────────────────────────────────────────────┐
│ 96px     │ 64px Sticky Top App Bar                    │
│ Rail     ├────────────────────────────────────────────┤
│          │ 可滚动主内容                               │
│          │                                            │
│          │                        ┌── side sheet 372 ──┤
│          │                        │                    │
│          │                   FAB  └────────────────────┤
└──────────┴────────────────────────────────────────────┘
```

- Rail 固定 96px，使用 `surface-low`，logo 44px，导航指示条 `56px × 32px`。
- 主列必须是 `flex-1 min-w-0`，防止长书名或菜单把布局撑破。
- 阅读设置打开时，桌面正文区同步预留 372px，不让 sheet 遮住当前阅读列。

### 4.3 手机骨架

```text
┌──────────────────────────────┐
│ safe-area-top + 56px 顶栏    │
│ 搜索 / 筛选                  │
│ 可滚动内容                   │
│                              │
│     FAB（抬离底栏与安全区）  │
├──────────────────────────────┤
│ 5rem + safe-area 底部导航    │
└──────────────────────────────┘
```

- 主内容必须挂 `.md-bottom-nav-space`，手机 FAB 必须使用 `.md-fab-pos`。
- 顶栏、底栏和 sheet 必须处理 `env(safe-area-inset-*)`。
- Bottom sheet 顶部必须有拖拽区，列表区域使用 `overscroll-contain`。
- 手机上打开会锁背景滚动的 sheet 时，关闭后必须恢复原滚动位置。

### 4.4 书架网格

只允许使用 `.md-shelf-grid`：

| 视口 | 列数 | Gap | Padding |
| --- | --- | --- | --- |
| `< 768px` | 3 | 12px | 14px / 16px |
| `768–899px` | 5 | 14px | 横向 20px |
| `900–1599px` | 6 | 16px | 18px / 28px |
| `>= 1600px` | 8 | 18px | 横向 36px |

「继续阅读」用 `.md-featured-cell` 跨列。禁止在书架组件里另写 `grid-cols-*` 或局部列数覆盖。

## 5. 组件状态模型

所有可交互组件都应明确定义以下状态，不应只做默认态与 hover。

| 状态 | 视觉要求 | 行为要求 |
| --- | --- | --- |
| Default | 使用正确 token 与层级 | 可聚焦、可点击 |
| Hover | 颜色或 1–2px 位移变化 | 仅在 `(hover: hover) and (pointer: fine)` 生效 |
| Pressed | 比 hover 更明确；允许 `scale(0.95~0.98)` | 按下后不能丢失焦点 |
| Focus-visible | 2px `primary` 外框，offset 2px | 键盘可见；鼠标点击不强制显示 |
| Selected | `primary-container` + `on-primary-container` 或专用勾选 | 同步 `aria-pressed` / `aria-checked` |
| Disabled | 保持可读轮廓，降低强调 | 禁止触发动作；原生 `disabled` 或 `aria-disabled` |
| Loading | 保持原尺寸，图标位置换成 spinner | 阻止重复提交，不引发布局跳动 |

Hover 规则：

- 触屏上不得依赖 hover 才能发现操作。触屏应常显按钮，参考 `.card-remove-btn`。
- 鼠标 hover 只用于补充反馈，不能承载唯一信息。
- 选中态不能只靠颜色差异，应该有容器、勾选或 `aria-*` 状态辅助。

## 6. 通用操作组件

### 6.1 主行动按钮与 FAB

书架唯一主行动是「导入」扩展 FAB，位置必须使用 `.md-fab-pos`。

| 项目 | 规范 |
| --- | --- |
| 尺寸 | 高 56px，扩展宽度由内容决定 |
| 内边距 | 横向 20px |
| 圆角 | 16px |
| 图标 | 24px 内联 SVG |
| 文字 | 13px / 700 |
| 颜色 | `primary` + `on-primary` |
| 反馈 | `active:scale-95`，200ms |
| 菜单 | 在 FAB 上方至少 68px，宽约 192px |

一屏只能有一个实心 `primary` 主按钮。Sheet 底部的「完成」属于当前面板主动作，不与页面 FAB
同时出现；不要在每个 section 里各放一个实心主按钮。

次要按钮使用文本色 `primary` 或中性 surface；禁止用多个不同容器色制造“按钮彩虹”。

### 6.2 图标按钮

```html
<button
  type="button"
  class="w-11 h-11 rounded-full grid place-items-center text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container)] transition-colors duration-200"
  title="关闭目录"
  aria-label="关闭目录"
>
  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18" />
  </svg>
</button>
```

- 常规图标按钮 44px；视觉可以 40px，但必须用 `.md-hit-target` 补到 44px。
- 图标 20px；线宽通常 2，勾选可用 2.4。
- 同一工具栏里的按钮保持同一尺寸与间距。
- 只显示图标时，`title` 与 `aria-label` 至少提供一个；二者都存在时文案应一致。
- SVG 本身设 `aria-hidden="true"`，避免屏幕阅读器重复朗读。

### 6.3 菜单与下拉

菜单结构由「触发按钮 + 点击背板 + 菜单容器 + 菜单条目」组成。

| 部位 | 规范 |
| --- | --- |
| 容器 | `surface-container`、16px 圆角、`shadow-xl`、6px 内边距 |
| 条目 | 最小高度 44px（手机），12px / 600，10–12px 圆角 |
| 选中 | `primary-container` + `on-primary-container` + 勾选图标 |
| 默认 hover | `surface-high` |
| 宽度 | 操作菜单 176–224px；不要按最长文案无限撑开 |
| 背板 | `fixed inset-0`，点击关闭 |
| 动效 | 200ms 淡入 + 上移/下移 8px |

触发按钮应带 `aria-haspopup="menu"` 与 `aria-expanded`。菜单项使用 `role="menuitem"`；
单选型菜单使用 `role="menuitemradio"` 与 `aria-checked`。

新增或重做菜单时，必须支持 Esc 关闭、关闭后焦点回到触发按钮。方向键导航和焦点循环属于
键盘增强项，应在菜单组件化时补齐。

### 6.4 搜索框

| 项目 | 手机 | 桌面 |
| --- | --- | --- |
| 高度 | 52px | 40px |
| 外层圆角 | 26px | 20px |
| 背景 | `surface-high` | `surface-high` |
| 文字 | 13px | 13px |
| 图标 | 20px，`on-surface-variant` | 同左 |
| 清除按钮 | 36px 视觉，44px 命中区 | 同左 |

- 使用 `type="search"`、`inputmode="search"`、`enterkeyhint="search"`。
- 外层 `.library-search-field` 承担焦点底色，输入框自身不画方形 focus ring。
- 清除按钮只在有值时出现，图标按钮必须有可访问名称。
- 搜索框不能压住桌面顶部标题与右侧操作，桌面最大宽度应受限。

### 6.5 Chips

| 状态 | 视觉 |
| --- | --- |
| Default | 透明或 surface 底，0.5px `outline-variant`，`on-surface` 文字 |
| Selected | `secondary-container` + `on-secondary-container`，3.5px 勾选 |
| Hover | `surface-container` 或 `surface-high`，仅 fine pointer |
| Focus-visible | 2px `primary` 外框 |

- 手机高度 44px，桌面高度 32px；不要靠极小的 chip 省空间。
- 横向 chip 列表可 `overflow-x-auto`，但必须使用 `.no-scrollbar` 并保留键盘可达性。
- 选中态使用 `aria-pressed`。

### 6.6 分段控件

组件：`src/components/MdSegmentedControl.vue`

```text
┌ surface-high 槽，3px padding，20px 圆角 ┐
│ [ primary 胶囊 ][ 未选中项 ][ 未选中项 ] │
└─────────────────────────────────────────┘
```

- 槽体：`surface-high`、20px 圆角、3px padding。
- 滑块：`primary`、17px 圆角，使用 `--md-ease-expressive` 做 280ms 位移。
- 选项：12px / 600；新组件按字号表收敛到 10.5px。
- 项数建议 2–3 个；超过 4 个或中文标签过长时改用菜单。
- 每项必须保持至少 44px 命中区，可用 `.md-hit-target` 扩展。
- 组件必须向父级 emit 点击源坐标，供需要从点击位置展开的动效使用。

公开 API：

| Prop / Event | 类型 | 说明 |
| --- | --- | --- |
| `modelValue` | `String \| Number`，必填 | 当前值 |
| `options` | `Array<{ value, label, title? }>`，必填 | 选项列表 |
| `ariaLabel` | `String` | 分组可访问名称 |
| `update:modelValue` | `(value, origin?) => void` | `origin` 为点击元素中心坐标 |

### 6.7 开关

组件：`src/components/MdSwitch.vue`

- 整个 44px 行可点击，右侧为 36px × 20px 轨道与 16px 滑块。
- 开启：`primary` 轨道 + `on-primary` 滑块。
- 关闭：`outline-variant` 轨道 + `on-surface` 滑块。
- 必须使用 `button type="button"`、`role="switch"`、`:aria-checked`。
- 滑块使用 `--md-ease-spring`，按下时可轻微横向拉伸；减少动态效果时全部关闭。
- 不要只给一行裸开关而没有关联标签；标签必须是点击目标的一部分。

公开 API：

| Prop / Event | 类型 | 说明 |
| --- | --- | --- |
| `modelValue` | `Boolean` | 当前开关状态 |
| `title` | `String` | 可选原生提示 |
| `update:modelValue` | `(value: Boolean) => void` | 状态变化 |
| 默认 slot | — | 开关行标签 |

### 6.8 进度滑条

组件样式：`.md-range`

| 项目 | 桌面 | 触屏 |
| --- | --- | --- |
| 命中高度 | 20px | 20px |
| 轨道 | 4px | 4px |
| 拇指 | 14px | 18px |
| 拇指光环 | 3px `surface` | 3px `surface` |

- 必须提供 `aria-label` 和可见页码辅助。
- RTL 翻页需要给滑条加 `.rtl-slider`，不要通过反转整个底栏实现。
- 拖动时持续更新视觉进度，持久化仍由现有节流机制负责。

## 7. 卡片与内容展示

### 7.1 书架卡片

组件：`src/components/BookCard.vue`  
外层类：`.md-shelf-card`

| 部位 | 规范 |
| --- | --- |
| 封面比例 | 3:4 |
| 卡片圆角 | 16px |
| 卡片底色 | `surface-container` |
| 外环 | 0.5–1px，`outline-variant` 至少 42% |
| 阴影 | 低对比软阴影，不能形成悬浮大圆角按钮 |
| Hover | 仅 fine pointer 上浮 2px；图片可轻微缩放 |
| 类型徽标 | 左上角胶囊，`surface` 半透明 + 模糊背景 |
| 移除按钮 | 右上角 32px 视觉，44px 命中区；触屏常显 |
| 进度条 | 底部 3px；轨道与填充都必须使用 token |
| 标题 | 单行截断，但必须有 `title` 或可访问全名 |

鼠标 hover 与触屏策略：

- 鼠标端移除按钮可通过卡片 hover 显形。
- 触屏端移除按钮必须常显，不能依赖悬停。
- 卡片 hover 不能改变网格尺寸或推动相邻卡片。

存量迁移要求：`BookCard.vue` 当前外层使用 `div @click`。修改该组件时必须迁移到语义化结构，
例如 `article` 内放一个覆盖整卡的「打开」button，并将移除按钮作为同级、更高层的独立按钮；
不要把移除按钮嵌套进打开按钮。

### 7.2 继续阅读特色卡

组件：`src/components/ContinueReading.vue`

- 必须占据网格首格，并使用 `.md-featured-cell`。
- 背景为 `primary-container`，文字为 `on-primary-container`。
- 手机整行显示，桌面跨两列；900–1179px 使用紧凑排版。
- 卡片本身是完整 button，不再嵌套按钮。
- 竖排书名只在桌面使用，手机退化为左下角横排短标题。
- 进度条、百分比与“继续阅读 / 开始阅读”必须同时可读，不能只靠颜色。

### 7.3 空态

组件：`src/components/EmptyShelf.vue`

- 使用 `surface-container` 容器与虚线 `outline-variant` 边框。
- 主文案说明当前为空；辅助文案说明可以导入什么。
- 手机只提示 FAB 路径，桌面可以提供文件/文件夹按钮。
- 格式标签使用 `primary-container` + `on-primary-container`。
- 空态不能伪装成主行动区域，避免与 FAB 竞争。

筛选后无结果的空态文案必须与“书架完全为空”不同，说明用户可以换关键词或筛选。

## 8. 导航与页面头部

### 8.1 Navigation Rail

组件：`src/components/SideNav.vue`

- 仅 `>=900px` 显示，宽 96px，sticky 满高，使用 `surface-low`。
- Logo 44px，14px 圆角，使用 `primary-container` + `on-primary-container`。
- 导航项图标容器 `56px × 32px`、16px 圆角；标签 10.5–12px。
- 选中态图标容器使用 `primary-container`，标签使用 `on-primary-container`。
- 底部「外观 / 设置」与主导航分开，避免与内容导航混淆。
- 每个导航项必须有 `title` 或 `aria-label`。

### 8.2 手机底部导航

- 固定高度 `calc(5rem + env(safe-area-inset-bottom))`，使用 `surface-container`。
- 每项图标指示器 `52px × 30px`、15px 圆角。
- 选中时指示器使用 `primary-container`，图标与标签使用 `on-primary-container`。
- 标签 10.5–12px / 600。
- 内容页必须通过 `.md-bottom-nav-space` 预留高度。
- 底部导航不得被转场容器、`overflow` 或 WebView 视口变化带出屏幕。

### 8.3 书架顶栏

组件：`src/components/LibraryHeader.vue`

- Sticky，`z-20`，背景 `surface`，手机 56px / 桌面 64px。
- 页面标题 21/22px / 500，作品数量使用 `secondary-container` 胶囊。
- 手机搜索框独占一行；桌面搜索框嵌入顶栏中段并限制宽度。
- 筛选 chips 在搜索下方；手机横向滚动，桌面不换行到不可用宽度。
- 菜单触发必须有 `aria-haspopup` 与 `aria-expanded`。

## 9. 浮层、抽屉与确认

### 9.1 遮罩

- 常规遮罩使用 `.md-scrim`，轻遮罩使用 `.md-scrim-soft`。
- 遮罩是关闭动作的一部分，但本身不是按钮；不要在其内部放文案或图标。
- 遮罩和 sheet 必须分层，遮罩 z-40、sheet z-50。
- 打开 sheet 时，背景页面不得继续滚动；关闭后必须恢复原滚动位置。

### 9.2 桌面侧边 Sheet

| Sheet | 宽度 | 边角 | 使用场景 |
| --- | --- | --- | --- |
| 阅读设置 | 372px，最大 92% | 左侧 28px 圆角 | 右侧打开 |
| 目录 | 320px，最大 88% | 右侧 28px 圆角 | 左侧打开 |

- 桌面进出场使用水平位移 + 200ms `.md-sheet-enter-active`。
- 头部固定，内容区 `flex-1 overflow-y-auto overscroll-contain`。
- 底部操作区固定，不得随长内容滚走。
- 阅读设置打开时，正文预留 372px，而不是在 sheet 下继续绘制可点击内容。

### 9.3 手机 Bottom Sheet

- 宽度 100%，底部对齐，最大高度 `78dvh`，顶部 28px 圆角。
- 顶部必须有 36px 高的拖拽区和 `32px × 4px` 拖拽条。
- 内容区独立滚动，`overscroll-contain`，底部留安全区。
- 关闭后焦点和背景滚动都必须恢复。
- 拖拽阈值：`min(112px, sheet 高度 × 22%)`；或位移超过 24px 且速度大于 0.6。
- 关闭/回弹使用 200ms `--md-ease-emphasized`；减少动态效果时直接落位。

### 9.4 桌面外观浮层

组件：`src/components/SideNav.vue` 内的外观浮层  
内容：`src/components/AppearancePanel.vue`

- 宽 280px，20px 圆角，16px 内边距。
- 位于 Rail 右侧 `left: 104px`、`bottom: 96px`。
- 背景 `surface-container`，z-50。
- 包含「阅读模式」与「主题色」两组，必须复用共享组件。
- 外观面板不是独立主页面，不应塞入阅读行为设置。

### 9.5 Sheet 通用结构

```text
┌────────────────────────────┐
│ 拖拽条（仅手机）            │
│ 17px 标题          关闭按钮 │
├────────────────────────────┤
│ 可滚动内容                  │
│ section + outline-variant  │
├────────────────────────────┤
│ 固定底部操作（如需要）      │
└────────────────────────────┘
```

要求：

- 标题 17px / 600，关闭按钮视觉 40px、命中区 44px。
- 分组之间用 0.5px `outline-variant` 分隔，组内 `py-3~3.5`。
- 标签行使用 11px / 600，右侧当前值使用 mono 12px / `on-surface-variant`。
- 关闭按钮必须有 `title` 与 `aria-label`。
- 新增 sheet 必须支持 Esc 关闭；底部 sheet 支持下拉关闭。
- 模态 sheet 的焦点圈定与关闭后焦点返回是新增组件的最低要求；存量组件随重做补齐。

### 9.6 确认操作

高风险且不可撤销的操作应使用明确的内联确认或专用确认面板，不得用浏览器 `confirm` / `alert`。

确认文案必须说明：

1. 将发生什么。
2. 是否可撤销。
3. 哪一个是安全出口。

不要使用含糊的「确定」「取消」作为唯一文案。

## 10. 主题相关组件

### 10.1 主题色板

组件：`src/components/ThemeSwatchGrid.vue`

- 固定 **5 列 × 2 行**，共 10 套主题。
- 容器最大宽度 248px，单个按钮约 44px。
- 圆盘视觉 30px，三阶切面效果来自三阶预览色。
- 选中态必须显示勾选，不能只改变圆盘阴影。
- 每个按钮必须有主题名称、`aria-label`、`aria-pressed`。
- 触屏不得依赖 hover 识别可点击性。

### 10.2 表面模式预览

组件：`src/components/SurfaceModePreview.vue`

- 三列固定顺序：白昼 / 夜间 / 护眼；顺序来自 `SURFACE_MODE_OPTIONS`。
- 最大宽度 280px，卡片比例约 0.72，16px 圆角。
- 卡片内的色块只做预览，不是用户自定义颜色入口。
- 选中态使用 `primary` 外环与勾选。
- 点击必须把按钮中心坐标传给 `theme.setSurfaceMode()`。
- 图标只作辅助，完整可访问名称应包含模式名称与说明。

## 11. 阅读器组件

### 11.1 阅读器顶栏与底栏

组件：`ReaderTopBar.vue`、`ReaderBottomBar.vue`

- 顶栏手机 56px / 桌面 64px，底栏手机 72px / 桌面 80px。
- 工具栏浮在阅读画布上方，使用 `surface`，0.5px `outline-variant` 分隔。
- 图标按钮统一 44px；桌面全屏按钮只在 `>=900px` 显示。
- 底栏包含页码、滑条、百分比和前后翻页；布局不得在窄屏溢出。
- 当前方向可用的前后按钮使用 `primary` 实心；另一端保持中性。
- RTL 下按 `rtlInvertButtons` 决定按钮语义与位置，但图标方向和 `aria-label` 必须一致。

### 11.2 工具栏自动隐藏

- `AUTO_HIDE_DELAY = 2200ms`，不得在组件内另设时长。
- 桌面鼠标靠近上下边缘或移动时重新计时。
- 触屏点击中间区域切换工具栏；点击左右 30% 执行翻页。
- 抽屉打开时不得自动隐藏。
- 关闭抽屉后重新显示并开始计时。

### 11.3 目录

组件：`ReaderTocDrawer.vue`

- 漫画目录使用 5 列页码格，每格高度 44px。
- 小说目录使用章节列表，每项最小高度 44px，可显示两行标题。
- 当前章节/页使用 `primary-container` + `on-primary-container`。
- 空目录必须显示「暂无章节信息」，不能留白。
- 跳转后关闭目录并恢复工具栏。

### 11.4 阅读设置

组件：`ReaderSettingsDrawer.vue`

分组顺序固定为：

1. 阅读方向
2. 翻页布局
3. 排版（非漫画）
4. 外观
5. 底部「恢复默认 / 完成」

要求：

- 分段控件和开关复用 `MdSegmentedControl.vue`、`MdSwitch.vue`。
- 双页在窄屏强制单页时，必须给出解释文案，不能静默忽略用户设置。
- 字号调整使用 44px 圆形按钮，桌面与触屏一致。
- 外观分组复用 `SurfaceModePreview.vue` 与 `ThemeSwatchGrid.vue`。
- 设置变化应立即预览并沿用现有进度/排版持久化逻辑。

### 11.5 阅读画布与手势

- 阅读舞台负责渲染；手势层 z-index 必须高于图片层。
- 手势层使用 `.reader-gesture-layer`，设置 `touch-action: none` 与 `overscroll-behavior: contain`。
- 横向滑动必须跟手、带阻尼和回弹；轻点左/右 30% 翻页，中间切换工具栏。
- 窄于 768px 时，即使设置为双页也强制单页。
- 双缓冲动画对象、DOM 引用和 Animation 必须保留为非深度响应式对象。
- 不能为了简化而把 `PaginatedView` / `WebtoonView` 改成响应式 `v-for` 动画布局。

## 12. 全局反馈与系统界面

### 12.1 拖拽导入

组件：`src/components/DragOverlay.vue`

- 仅桌面等支持拖拽导入的平台挂载监听。
- 全窗遮罩使用对应 surface token，虚线边框 2px `primary`。
- 必须明确提示支持格式和「松手即可加入书架」。
- 拖拽层级为 z-60，不能盖住启动 Splash。
- 离开、取消和 drop 后都必须清理状态，不能残留遮罩。

### 12.2 启动 Splash

- 首帧前由 `index.html` 同步恢复主题，启动层不得出现黑屏或主题闪白。
- 文案与图标必须可被辅助技术识别为“正在启动”。
- 淡出约 200ms；`prefers-reduced-motion` 下直接结束。
- 启动层只用于等待首次书架恢复，不承载营销、错误或更新公告。

### 12.3 错误与恢复

- 可恢复错误写入 `console.warn` / `console.error`，保持界面可继续操作。
- 不允许用 toast / alert 打断阅读或导入。
- 阻断性错误应在对应区域提供内联说明与下一步动作。
- 导入、存储、PDF 渲染失败的提示必须可定位到具体操作，不写“出错了”这种空话。

## 13. 可访问性与内容规范

### 13.1 可访问性

- 所有交互控件必须有可感知的焦点态。使用全局 `:focus-visible`，不要随意 `outline: none`。
- 只有图标时要有 `title` 或 `aria-label`；装饰性 SVG 使用 `aria-hidden="true"`。
- 开关使用 `role="switch"` 与 `aria-checked`。
- 选择型按钮使用 `aria-pressed`；单选菜单项使用 `aria-checked`。
- 菜单、sheet 触发按钮带 `aria-haspopup` 与 `aria-expanded`。
- 图标按钮视觉可以小于 44px，但命中区域不得小于 44px。
- 动态百分比、页码与进度必须使用可读文本，不要只显示图形。
- 动画尊重 `prefers-reduced-motion`。
- 触屏手势必须提供按钮或键盘替代，不允许只靠滑动手势完成关键操作。
- 内容区可选中，控件区保持 `select-none`；不要让用户无法复制正文。

### 13.2 文案

- 使用简体中文作为主界面语言；英文只用于格式名、kicker 和已有术语。
- 动作按钮使用动词：「导入文件」「恢复默认」「关闭目录」。
- 省略号使用中文排版 `…`，不要写三个英文句点。
- 数字与单位之间保留可读空格，例如 `12 页`、`18 px`、`2200ms` 仅在技术说明中使用。
- 状态文案应说明结果，不只说明过程，例如「窄屏会自动按单页显示」。
- 删除、清空必须显式写对象与范围：「清空书架」而不是「清理」。

### 13.3 内容密度

- 书名、作者、页数、章节、进度等信息按“标题 → 次要信息 → 元信息”建立层级。
- 同一行最多保留两个低频元信息；更多信息换行或收进详情。
- 长书名优先截断并提供 `title`；不要让卡片高度互相追逐。
- 空态、错误态和辅助说明使用 `on-surface-variant`，不使用装饰性英文填充空白。

## 14. Vue 实现约定

### 14.1 文件与分层

- 生产组件放在 `src/components/`，使用 Vue 3 `<script setup>` 与单引号、分号、2 空格缩进。
- 纯展示与交互组件不直接写复杂存储逻辑；产品级组件可使用对应 Pinia store。
- 可复用的复杂手势放在 `src/composables/`；解析、存储和平台能力留在 `src/services/`。
- Pinia 使用 setup 写法；store 只保存状态与动作，不直接操作复杂 DOM。
- 新增依赖必须有明确必要性；图标、日期、状态管理等基础能力不得为重复轮子引入库。

### 14.2 Props、事件与状态

- 双向控件统一使用 `modelValue` + `update:modelValue`。
- Props 必须提供类型与合理默认值；数组/对象默认值使用工厂函数。
- 事件名使用 kebab-case；组件内部 emit 时不要泄漏内部实现对象。
- 视觉状态优先由 props / store 派生，不在 DOM 中手动加 `is-active` 类。
- 高频动画与手势使用 `shallowRef`、普通变量或直接 DOM 操作。

### 14.3 样式

- 布局和 token 颜色优先使用 Tailwind 任意值类，例如
  `bg-[var(--md-surface-container)]`、`min-[900px]:h-16`。
- 组件内部复杂状态、伪元素、轨道路径等使用 scoped CSS。
- 全项目共享的类放在 `src/assets/homura.css`，例如 `.md-shelf-grid`、`.md-range`、
  `.md-sheet-enter-active`。
- 不允许在组件内定义一套私有颜色变量覆盖 `--md-*` 语义。
- 新增共享类后，必须同步更新 [tokens.md](./tokens.md) 的组件类清单。

### 14.4 语义与键盘

```html
<!-- 正确：原生按钮，键盘和屏幕阅读器可用 -->
<button type="button" @click="close">
  关闭
</button>

<!-- 错误：键盘不可达，且会产生错误语义 -->
<div class="button" @click="close">关闭</div>
```

- 容器级点击交互只用于装饰性遮罩，且不得成为唯一关闭方式。
- 菜单、sheet、分页器都要能被键盘操作。
- 输入控件必须有 label 或 `aria-label`；placeholder 不是标签。
- 禁用交互使用原生 `disabled`，不要只做视觉置灰。

## 15. 评审与验收

### 15.1 组件级 Definition of Done

- [ ] 颜色全部来自 `--md-*`，没有新增 hex / `rgb()` / 纯黑纯白。
- [ ] 容器色与 `on-*` 文字成对使用。
- [ ] 10 套主题下选中态、描边和文字仍可识别。
- [ ] 白昼、护眼、夜间三种表面逐屏检查，没有硬编码文字色。
- [ ] 390px、768px、899px、900px、1440px 无横向溢出。
- [ ] 手机底部导航、FAB、sheet 与安全区不互相遮挡。
- [ ] Hover 只在 fine pointer 生效；触屏操作常显或可发现。
- [ ] 图标按钮有 `title` 或 `aria-label`；开关/菜单具备正确 ARIA。
- [ ] 键盘可到达，`:focus-visible` 清楚；没有 `<div @click>` 伪按钮。
- [ ] 200ms 动效与 `prefers-reduced-motion` 正常。
- [ ] 重对象未进入响应式深度代理。
- [ ] `npm run build:vite` 通过，控制台无报错、无 404。
- [ ] 新增共享类或 token 时已同步 `references/tokens.md`。
- [ ] 没有提交构建产物或 `.trae/` 本地配置。

### 15.2 按改动范围追加验证

| 改动 | 必须追加验证 |
| --- | --- |
| 书架/卡片 | 空书架、筛选无结果、长标题、移除按钮、390/1440 网格 |
| 菜单/sheet | 点击外部、Esc、关闭后焦点、手机拖拽、背景滚动恢复 |
| 主题/外观 | 10 套主题切换、白昼/护眼/夜间、720ms reveal、原生标题栏同步 |
| 阅读器 | LTR/RTL/竖排、单页/双页、翻页动画、进度恢复、工具栏自动隐藏 |
| 导入/错误态 | 拖拽、文件选择、失败后界面可操作、console 记录可定位 |
| Tauri/窗口 | 启动不黑屏、全屏进出、标题栏随表面切换 |

## 16. 变更流程

新增或修改 UI 时按以下顺序执行：

1. 先找可复用的现有组件、CSS 类和 token。
2. 确认布局断点、触控方式和可访问名称。
3. 只在确实缺少语义时新增组件或共享类。
4. 同步检查三种表面与十套主题。
5. 跑 `npm run build:vite`，按改动范围做真实交互验证。
6. 更新本规范或 [tokens.md](./tokens.md) 中受影响的条目。

如果一个新组件需要三套新颜色、两套新圆角和一个新的全局层级，通常不是组件需求，而是设计方向跑偏了。
先回到 HOMURA 的内容层级与单一主行动原则，再决定是否需要扩展系统。
