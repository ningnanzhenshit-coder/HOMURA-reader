# HOMURA MD3 新组件实现手册

> 适用版本：HOMURA `2.2.1`
> 适用范围：`src/components/` 中新增或重写的生产组件。  
> 目标：新组件不必重新发明按钮、列表、抽屉和状态层，直接沿用当前这套 MD3 语言。

新增 UI 前先读本文，再按需查：

- [AGENTS.md](../AGENTS.md)：项目硬约束与不能破坏的行为。
- [tokens.md](./tokens.md)：主题色、表面阶与 token 速查。
- [ui-component-spec.md](./ui-component-spec.md)：系统级布局与历史组件说明。

如果本文与旧文档不一致，以**当前 `src/` 实现 + 本文**为准；同时顺手修正文档，不要继续复制过时尺寸。

## 1. 六十秒选型

先判断需求属于哪类，再选现成实现。新组件的第一原则不是「设计一个新样子」，而是「复用已经成立的 MD3 角色」。

| 需求 | 首选实现 | 不要做 |
| --- | --- | --- |
| 页面主行动 | `.md-filled-button` | 自造渐变按钮、多个实心主按钮 |
| 次要行动 | `.md-tonal-button` | 再定义一个近似色容器 |
| 低强调行动 | `.md-text-button` | 用链接伪装按钮 |
| 只有图标的工具按钮 | `.md-icon-button` | 24px 小按钮、`div @click` |
| 二到四个互斥选项 | `MdSegmentedControl.vue` | 手写一排不同圆角的按钮 |
| 布尔开关 | `MdSwitch.vue` | 自绘 checkbox 或点整行文字冒充开关 |
| 设置列表 / 目录条目 | `.md-drawer-list-item` | 临时拼 `div + @click` |
| 漫画页码 | `.md-toc-grid` + `.md-toc-page` | 五颜六色的页码按钮 |
| 右侧设置 / 目录面板 | `.md-drawer` + `ReaderDrawerHeader.vue` | 新写一套 sheet 外壳 |
| 遮罩 | `.md-scrim` | 新建半透明黑色 |
| 进度 / 字号滑条 | `MdRange.vue` + `.md-range` | 原生蓝轨道、圆形小拇指、手写活动轨道 |
| 书架内容卡 | `.md-card` + `.md-shelf-card` / `.md-collection-card` | 私有圆角、私有阴影 |
| 书架网格 | `.md-shelf-grid` | 组件内另写 `grid-cols-*` |
| 筛选 chip | `.md-filter-chip` | 实心彩色胶囊 |
| 菜单 | `.md-menu` + `.md-menu-item` | 系统右键菜单或无边界浮层 |

共享类都在 `src/assets/homura.css`。只在**至少两个组件复用**时新增共享类；单个组件的构图放 scoped CSS，但颜色、圆角、阴影仍必须使用 token。

## 2. 视觉基线

### 2.1 表面与文字必须成对

| 角色 | 背景 | 前景 | 典型用途 |
| --- | --- | --- | --- |
| 页面画布 | `surface` | `on-surface` | 页面底色、顶栏 |
| 浮层 / 抽屉 | `surface-container` | `on-surface` | sheet、浮动工具栏、菜单 |
| 内容卡 | `surface-highest` | `on-surface` | 书架卡、书库卡 |
| 输入槽 / 轻量控件底 | `surface-high` | `on-surface` | 搜索、页码格、提示条 |
| 主行动 | `primary` | `on-primary` | 保存、完成、当前翻页方向 |
| Tonal 行动 | `secondary-container` | `on-secondary-container` | 次要按钮、当前列表项 |
| 品牌 / 特色容器 | `primary-container` | `on-primary-container` | 继续阅读、关于页封面 |
| 辅助强调 | `tertiary-container` | `on-tertiary-container` | 少量装饰与渐变混色 |
| 次要说明 | 透明或对应容器 | `on-surface-variant` | 副标题、分组标签、元信息 |
| 边界 | 透明 | `outline-variant` | 分组线、控件描边 |

约束：

- 禁止新增 hex、`rgb()`、纯黑纯白。需要状态层时使用 `color-mix(in oklab, ...)`。
- 阴影和遮罩只用 `--md-shadow-color`；不要用 `--md-on-surface` 当阴影色，夜间会泛白。
- Tailwind 不要写 `bg-[var(--md-surface)]/92`，改用 `color-mix`。
- 一屏只有一个实心 `primary` 主行动。抽屉底部的「完成」与页面 FAB 不同时出现。
- 需要透明度时优先叠在正确容器上，不要靠降低整个组件 `opacity` 来解决层级。

### 2.2 当前没有 error token

当前 `homura.css` 没有定义 `--md-error`。新组件不要直接使用未定义变量。

- 可恢复错误使用 `role="alert"` 的内联提示，容器为 `surface-high` / `surface-container`，文字使用 `on-surface`。
- 阻断性错误留在对应区域内说明原因与下一步，不弹 toast、`alert` 或全局浮条。
- 如果确实要新增错误语义色，必须一次补齐 10 套主题的明暗 `--md-error*` 对，并同步 `tokens.md`；不要只给某个组件写死红色。

### 2.3 字号与密度

| 层级 | 字号 | 字重 | 用途 |
| --- | --- | --- | --- |
| 页面标题 | 21 / 22px | 600 | 桌面 22、手机 21 |
| 抽屉标题 | 17px | 600 | `md-drawer-title` |
| 正文、输入、按钮 | 13px | 500–600 | 主要可读文字 |
| 紧凑控件 | 12px | 600 | 分段控件、菜单补充文字 |
| 分组标签 | 11px | 600 | `md-drawer-group-label` |
| 元信息 | 10.5px | 500–600 | 页码、百分比、mono 信息 |

新组件不要随手插入 14 / 15 / 16px。数字类信息必须使用等宽字体和 `font-variant-numeric: tabular-nums`，避免更新时抖动。

### 2.4 间距节奏

共享间距刻度定义在 `src/assets/homura.css` 的 `--md-space-25` 到 `--md-space-900`，
命名沿用 Material spacing：`space100 = 8px`。

- **8px 是主节奏**：表单行、按钮组、列表条目与卡片内部优先取 8 / 12 / 16 / 24 / 32px。
- **4px 用于紧凑排布**：小图标与文字、徽标、分段控件内部可以取 4px。
- **2px / 6px 只做细化**：描边、焦点环避让、文字基线与既有光学修正。
- 页面 gutter 保持手机 16px、平板 20px、桌面 28px、超宽屏 36px；书架网格 gap 使用
  手机 12px、平板与桌面 16px、1600px 以上 24px。
- 卡片信息区手机用 8px 内边距，平板与桌面用 `8px 12px 12px`；同一组卡片的封面
  与信息栏必须共用这套内边距，不要分别微调 1–2px。
- 组内纵向间距用 8–16px，组间用 20–24px；不要靠一串相邻的 13 / 14 / 18px 拼出层级。

### 2.5 圆角与触控

| 元素 | 规范 |
| --- | --- |
| 图标按钮 | 48px 圆形容器，图标 22px |
| 普通按钮 | 最小 48px 高，`999px` 胶囊 |
| 菜单条目 / 设置条目 | 最小 48px；目录列表项 52px |
| 书架卡 | 12px 圆角 |
| 浮层与阅读器工具条 | 28px 圆角 |
| 手机 bottom sheet | 顶部 28px 圆角 |
| 分段控件 | 20px 外框、17px 滑块 |

44px 是最低命中区，不是新组件的视觉标准。只有视觉必须更小的控件才用 `.md-hit-target` 补足。

## 3. 组件写法

### 3.1 行动按钮

共享按钮只有三档，尺寸、圆角、状态和触控高度已经统一：

```html
<button type="button" class="md-filled-button">完成</button>
<button type="button" class="md-tonal-button">选择封面图片</button>
<button type="button" class="md-text-button">恢复默认</button>
```

- 一个面板只保留一个 `.md-filled-button`。
- 同组按钮的 `gap` 用 8–12px，不要另加不同高度。
- 按钮文字必须是动词；图标只作辅助，并设置 `aria-hidden="true"`。
- 加载时保持原宽度，替换图标或文字为短状态，不让底部操作区跳动。

### 3.2 图标按钮

```html
<button
  type="button"
  class="md-icon-button"
  title="关闭目录"
  aria-label="关闭目录"
>
  <MdIcon name="close" />
</button>
```

- 基础态透明底；`is-outlined` 加 1px `outline-variant`；`is-filled` 用于当前方向、主行动或明确选中态。
- 图标统一走 `MdIcon.vue`（Material Symbols，24dp 网格）；按钮内 24px，菜单 20px，chip 18px。
- 选中态改用 `filled`，不要自制实心/描边两套几何。
- 同一个工具栏保持 48px 等宽，不按图标视觉大小改容器。
- 只用图标时，`title` 与 `aria-label` 至少有一个；两者同时存在时文案一致。
- 触发抽屉的按钮必须同时设置 `aria-controls` 和 `aria-expanded`。

### 3.3 分段控件

```html
<MdSegmentedControl
  class="w-full"
  :model-value="config.direction"
  :options="directionOptions"
  aria-label="阅读方向"
  @update:model-value="setDirection"
/>
```

- 2–4 个互斥选项使用此组件；更多选项改用菜单或列表。
- 必须传 `aria-label`，选项字面量保持短而平行。
- 当前实现通过 `update:modelValue` 的第二个参数附带点击坐标，供表面切换 reveal 使用；不要丢掉第二个参数。
- 选中态由 `primary` 滑块 + `on-primary` 文字承担，不要给每个选项各上一种颜色。

### 3.4 开关

```html
<MdSwitch
  :model-value="config.coverOffset"
  title="双页模式下首页单独显示，确保后续跨页大图对齐"
  @update:model-value="toggleCoverOffset"
>
  <span class="text-[13px] font-medium">首页单排</span>
</MdSwitch>
```

- 开关本身使用原生 `button` + `role="switch"` + `aria-checked`，不要再套 checkbox。
- 行高至少 48px；说明文字放 slot，不能挤进 52×32 的轨道。
- 关闭态使用 `surface-highest` 轨道、2px `outline` 描边和 16px `outline` 滑块；开启态切换到 `primary` 轨道与 24px `on-primary` 滑块。
- 40px 状态层仅在 hover / 聚焦 / 按下时出现；键盘焦点画在轨道外圈，不能依赖整行外框。
- 滑块按下时 28px；280ms 弹簧只用于滑块位移与尺寸，不要复制到整个面板。

### 3.5 设置分组

抽屉内统一使用全局分组类，不在组件里复制 label/value 样式：

```html
<section class="md-drawer-section">
  <div class="md-drawer-group-head">
    <span class="md-drawer-group-label">阅读方向</span>
    <b class="md-drawer-group-value">{{ directionLabel }}</b>
  </div>

  <MdSegmentedControl ... />
</section>
```

- 分组间由 `.md-drawer-section` 的 `outline-variant` 分隔线负责，不要在每组自画 `<hr>`。
- 组内纵向间距用 12–16px；组间不要出现多个竞争性的标题层级。
- 右侧当前值使用 `md-drawer-group-value`，避免每个组件自己选灰色。

### 3.6 抽屉与 Sheet

新抽屉必须复用当前外壳和拖拽行为。不要再造第三套 side sheet。

```html
<Transition
  enter-active-class="md-fade-enter-active"
  enter-from-class="opacity-0"
  enter-to-class="opacity-100"
  leave-active-class="md-fade-leave-active"
  leave-from-class="opacity-100"
  leave-to-class="opacity-0"
>
  <div
    v-if="open"
    class="absolute inset-0 z-40 md-scrim"
    @click="close"
  ></div>
</Transition>

<Transition
  enter-active-class="md-sheet-enter-active"
  :enter-from-class="isCompact ? 'translate-y-full' : 'translate-x-full'"
  :enter-to-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
  leave-active-class="md-sheet-leave-active"
  :leave-from-class="isCompact ? 'translate-y-0' : 'translate-x-0'"
  :leave-to-class="isCompact ? 'translate-y-full' : 'translate-x-full'"
>
  <aside
    v-if="open"
    ref="sheetRef"
    class="md-drawer"
    aria-labelledby="example-sheet-title"
  >
    <ReaderDrawerHeader
      :is-compact="isCompact"
      title="示例设置"
      subtitle="一句可选的上下文"
      title-id="example-sheet-title"
      close-label="关闭示例设置"
      @close="close"
      @drag-start="onDragStart"
      @drag-move="onDragMove"
      @drag-end="onDragEnd"
      @drag-cancel="onDragCancel"
    />

    <div class="md-drawer-body px-5 min-[900px]:px-6">
      <section class="md-drawer-section">
        <!-- 控件 -->
      </section>
    </div>

    <div class="md-drawer-actions">
      <button type="button" class="md-text-button">恢复默认</button>
      <button type="button" class="md-filled-button">完成</button>
    </div>
  </aside>
</Transition>
```

布局规则：

- 桌面 `>=900px`：宽 372px，最大 92%，贴右侧，左侧 28px 圆角。
- 手机 `<900px`：底部 sheet，最大 `78dvh`，顶部 28px 圆角，保留安全区。
- 头部固定；`.md-drawer-body` 独立滚动并设置 `overscroll-behavior: contain`；底部操作区固定。
- 手机拖拽条由 `ReaderDrawerHeader` 渲染，手势逻辑统一走 `useSheetDrag()`。
- 遮罩 z-40，sheet z-50；不要新增 `z-[999]`。
- 抽屉打开时禁止背景滚动并停止工具栏自动隐藏；关闭后恢复焦点与滚动位置。

### 3.7 列表项与页格

章节、书库顺序、筛选项等连续条目：

```html
<button
  type="button"
  class="md-drawer-list-item"
  :class="{ 'is-active': active }"
  :aria-current="active ? 'true' : undefined"
>
  <span class="md-drawer-item-index" aria-hidden="true">01</span>
  <span class="md-drawer-item-label line-clamp-2">章节标题</span>
  <span v-if="active" class="md-drawer-item-meta">正在阅读</span>
</button>
```

- 选中项使用 `secondary-container` / `on-secondary-container`，不靠左侧突然出现一条粗色条。
- 当前项同时提供 `aria-current`，不要只改背景色。
- 漫画页码用 `.md-toc-grid` 与 `.md-toc-page`；当前页同样使用 secondary container 对。

### 3.8 内容卡与网格

- 书架网格只用 `.md-shelf-grid`；跨列只用 `.md-featured-cell`。
- 单本内容卡使用 `.md-shelf-card`；书库拼贴卡使用 `.md-collection-card`。
- 卡片圆角 12px。filled 用 `surface-container-highest`，默认无边框、无阴影；hover 只叠加 8% 状态层，focus / pressed 为 10%，不做抬升位移。
- 三种 M3 卡型：filled（`surface-container-highest`）、outlined（`surface` + 1px `outline-variant`）、elevated（`surface-container-low` + level 1）。HOMURA 书架默认 filled。
- 触屏上的移除、多选等操作必须常显；hover 只服务鼠标设备。
- 卡片本身只能有一个主点击目标；不要在整卡按钮内部再嵌按钮。

### 3.9 品牌 Hero / 封面容器

关于页的 `.about-hero` 是内容型品牌容器的基准：左侧封面区、右侧信息区，窄屏上下堆叠。

- 背景用 `primary-container` 向 `tertiary-container` 混色，文字用 `on-primary-container`。
- 版本徽章用 `surface-container` / `on-surface`，形成局部对比，不把白底黑字写死。
- 装饰线、色环只用 `on-primary-container` 或 `secondary-container` 的低透明度 `color-mix`。
- 宽屏 `>=1200px` 双栏；中窄屏堆叠。这个断点只服务该内容容器，不替代全局 900px 主断点。
- 信息区优先使用「标语 → 隐私说明 → 一个主行动 → 元信息」；不要退回营销海报式大字水印。

## 4. 响应式与布局

### 4.1 主断点

| 范围 | 布局 |
| --- | --- |
| `<900px` | 手机 / 紧凑布局：底部导航、bottom sheet |
| `>=900px` | 桌面布局：浮动侧栏、side sheet |

`isCompact`、Tailwind `min-[900px]:` 和 CSS `@media (min-width: 900px)` 必须表达同一件事。`isPhone` / `isTablet` / `isDesktop` 只用于细节差异，不得另起一套壳。

### 4.2 当前尺寸

- 桌面侧栏：展开 220px / 折叠 104px，28px 圆角。
- 手机底部导航：76px 高、38px 圆角、左右 14px、距底 `14px + safe-area`。
- 内容区底部必须使用 `.md-bottom-nav-space`。
- 阅读器顶部栏：手机最小 64px；桌面最小 64px。底部栏：手机最小 72px；桌面最小 76px。
- 阅读器工具条左右 12px（桌面 16px），圆角 28px，浮在画布上，不贴边。
- 新内容区采用 `min-width: 0` 和 `overflow` 约束；长标题优先截断，不能把 sheet 或卡片撑破。

### 4.3 阅读器专属

- 工具栏自动隐藏仍是 2200ms；抽屉打开期间不隐藏。
- 手势层必须高于阅读舞台图片层，且使用 `.reader-gesture-layer`。
- `<768px` 强制单页；不要在新组件里另算双页。
- 点击左/右 30% 翻页、中间切换工具栏的行为不能被新按钮破坏。
- 设置或目录抽屉打开时，桌面阅读正文要预留 372px，而不是在抽屉下面保留可点击内容。

## 5. 状态与交互

每个交互组件至少完成以下状态：

| 状态 | 要求 |
| --- | --- |
| Default | token 正确、键盘可聚焦 |
| Hover | 只对 `(hover: hover) and (pointer: fine)` 生效 |
| Pressed | 使用 8–12% 状态层或轻微缩放 |
| Focus-visible | 2px `primary` 外框，offset 2px |
| Selected | 容器 + 文字成对使用选中 token，并同步 ARIA |
| Disabled | 保留可读轮廓，原生 `disabled` |
| Loading | 保持尺寸，不触发布局跳动 |

交互底线：

- 禁止用 `<div @click>` 冒充按钮；禁止在一个按钮里嵌另一个按钮。
- 触屏不能依赖 hover 才能看到操作。
- 关闭浮层后焦点回到触发按钮；Esc 可关闭。
- 打开 sheet 要锁背景滚动，关闭后恢复原位置。
- 异步失败留在当前区域说明；不要把用户阅读流打断成 toast。

## 6. 可访问性

- 交互元素只用原生 `button`、`a`、`input`、`select`。
- 图标按钮至少有 `title` 或 `aria-label`；装饰 SVG 加 `aria-hidden="true"`。
- 开关：`role="switch"` + `aria-checked`，当前由 `MdSwitch` 统一实现。
- 互斥按钮：`aria-pressed`；当前页/章节：`aria-current`。
- 抽屉触发器：`aria-controls` + `aria-expanded`。
- 输入控件必须有 label 或 `aria-label`，placeholder 不算 label。
- 动态页码、百分比和当前状态必须用文本表达，不能只靠颜色。
- 视觉图标可以小，但交互命中区不得小于 44px。

## 7. 动效与性能

| 场景 | 时长 / 曲线 |
| --- | --- |
| 常规颜色、透明度、浮层进出 | 200ms / `--md-ease-emphasized` |
| 分段控件滑块 | 280ms / `--md-ease-expressive` |
| 开关滑块 | 280ms / `--md-ease-spring` |
| 卡片 hover | 200ms，只改状态层透明度 |

规则：

- 只过渡颜色、透明度、transform、shadow；不要给 width、height、padding、grid 加 transition。
- 新增动效必须写 `prefers-reduced-motion: reduce` 分支。
- 高频手势、双缓冲动画、timer、DOM 引用使用 `shallowRef` 或普通变量，不能进 Vue 深度响应式代理。
- 表面切换 720ms reveal 是系统级能力，只在 `theme.js` 维护，普通组件不要复制。

## 8. Vue 与分层

- Vue 3 `<script setup>`，纯 JavaScript，2 空格缩进、单引号、语句分号。
- 新增可复用基础控件放 `src/components/`；手势放 `src/composables/`；解析/存储/平台能力放 `src/services/`。
- 视觉状态由 props / store 派生；不要手动到处加 `is-active`。
- 复杂交互组件优先复用 `MdSegmentedControl`、`MdSwitch`、`ReaderDrawerHeader` 和 `useSheetDrag`。
- 图标统一走 `MdIcon.vue` 的 Material Symbols 内联 SVG；不引入图标库、组件库或远程字体。
- 重对象、文件句柄、Zip 内容、Animation 和 DOM 引用不要使用深层 `ref`。
- `settings-*` 这类页面级 scoped class 不要跨文件复制；重复后再提炼到 `homura.css`。

## 9. 交付检查清单

新增组件提交前至少确认：

- [ ] 先检查了现有共享组件和类，没有重复造按钮、开关、分段控件或 sheet。
- [ ] 颜色全部来自 `--md-*`，容器与 `on-*` 成对。
- [ ] 没有新增 hex、`rgb()`、纯黑纯白、`--brand-*` / `--bg-*` / `--fg-*`。
- [ ] 阴影、遮罩全部使用 `--md-shadow-color`。
- [ ] 主行动只有一个；其余操作使用 tonal / text / icon。
- [ ] 图标按钮有可访问名称；开关、选中项、抽屉展开状态有正确 ARIA。
- [ ] 桌面 900px 与手机 390px 都能用；无横向溢出。
- [ ] 手机底栏、FAB、sheet、安全区互不遮挡。
- [ ] 十套主题、白昼 / 护眼 / 夜间下文字与选中态可读。
- [ ] `prefers-reduced-motion: reduce` 下没有失效的固定态。
- [ ] `npm run check:dark-glow` 通过。
- [ ] `npm run build:vite` 通过，控制台无新增错误或 404。
- [ ] 新增共享类 / token 后同步更新本手册和 `tokens.md`。
- [ ] 没有提交 `dist/`、`public/pdfjs/` 或构建产物。

## 10. 当前参考实现

| 需要抄的结构 | 参考文件 |
| --- | --- |
| 图标按钮、浮动顶栏 | `src/components/ReaderTopBar.vue` |
| 进度滑条、浮动底栏 | `src/components/ReaderBottomBar.vue` |
| 抽屉外壳、拖拽、底部操作 | `src/components/ReaderSettingsDrawer.vue` |
| 抽屉标题与手机拖拽条 | `src/components/ReaderDrawerHeader.vue` |
| 章节列表与当前项 | `src/components/ReaderTocDrawer.vue` |
| 本目录顺序列表 | `src/components/ReaderCollectionDrawer.vue` |
| 分段选择 | `src/components/MdSegmentedControl.vue` |
| 开关 | `src/components/MdSwitch.vue` |
| 进度 / 字号滑条 | `src/components/MdRange.vue` |
| 设置分组与响应式布局 | `src/components/SettingsView.vue` |
| 品牌 Hero / 封面容器 | `SettingsView.vue` 的 `.about-hero`、`.about-cover` |
| 共享组件类与 token | `src/assets/homura.css` |

一句话原则：**新组件应该像这套界面里本来就长出来的一样；如果它需要一套新颜色、一套新圆角和一套新层级，先回到现有 MD3 组件里找答案。**
