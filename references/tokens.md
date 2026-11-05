# HOMURA MD3 Token 速查

来源：`src/assets/homura.css`（1. 主题色 / 2. 表面阶 / 3. 遗留别名 / 4. 组件类）。改 token 时先改 CSS，再回来同步本表。

## 1. 主题色 · 白昼（`html[data-theme="x"]`）

| seed | 名称 | primary | on-primary | primary-container | on-primary-container | secondary | secondary-container | on-secondary-container | tertiary | tertiary-container | on-tertiary-container |
|---|---|---|---|---|---|---|---|---|---|---|---|
| green | 森系绿 | #386A20 | #FFFFFF | #B8F397 | #042100 | #55624C | #D9E7CB | #131F0D | #386666 | #BBEBE8 | #002020 |
| mint | 薄荷青 | #006A60 | #FFFFFF | #74F8E5 | #00201C | #4A635F | #CCE8E2 | #06201C | #456179 | #D0E4FF | #001D33 |
| cyan | 海盐青 | #006874 | #FFFFFF | #9CEFF7 | #002023 | #486265 | #CBE7EA | #041F21 | #48627C | #D0E4FF | #001D34 |
| blue | 深海蓝 | #0061A4 | #FFFFFF | #D1E4FF | #001D36 | #535F70 | #D7E3F7 | #101C2B | #6B5778 | #F2DAFF | #251431 |
| violet | 鸢尾紫 | #4F5DA8 | #FFFFFF | #DFE0FF | #11184A | #5B5E72 | #E0E1F9 | #181A2C | #76546D | #FFD7F3 | #2D122A |
| orchid | 兰花紫 | #7B4E9E | #FFFFFF | #F3DAFF | #2F0E4A | #685A71 | #F0DDF5 | #23182C | #7D5260 | #FFD8E4 | #31111D |
| sakura | 樱雾粉 | #984061 | #FFFFFF | #FFD9E2 | #3E001D | #74565F | #FFD9E1 | #2B151C | #7C5635 | #FFDCC1 | #2E1500 |
| red | 落日赤陶 | #9C4233 | #FFFFFF | #FFDAD4 | #410002 | #775650 | #FFDAD6 | #2C1512 | #705C2E | #F7DFA5 | #251A00 |
| amber | 琥珀金 | #785900 | #FFFFFF | #FFDF9E | #261A00 | #6B5D3F | #F2E0BB | #231B04 | #4A6546 | #CCEBC3 | #05210A |
| olive | 橄榄青 | #5D6100 | #FFFFFF | #E5EE8A | #1B1D00 | #60614B | #E6E6CF | #1C1D0C | #4B6078 | #D3E3FF | #041D34 |

## 2. 主题色 · 夜间（`html[data-mode="dark"][data-theme="x"]`）

| seed | primary | on-primary | primary-container | on-primary-container | secondary | secondary-container | on-secondary-container | tertiary | tertiary-container | on-tertiary-container |
|---|---|---|---|---|---|---|---|---|---|---|
| green | #9CD67E | #0C3900 | #235100 | #B8F397 | #C0CCB4 | #3C4A33 | #D9E7CB | #A0CFCC | #1E4B49 | #BBEBE8 |
| mint | #55DBCB | #003731 | #005047 | #74F8E5 | #B1CCC6 | #334B47 | #CCE8E2 | #ADCAE5 | #2D4960 | #D0E4FF |
| cyan | #82D3DF | #00363D | #004F57 | #9CEFF7 | #B1CBCE | #314B4E | #CBE7EA | #B0C9E8 | #304964 | #D0E4FF |
| blue | #A6C8FF | #003258 | #00497D | #D1E4FF | #BEC8DC | #3E4759 | #DAE2F9 | #DDBCEE | #543F5E | #F9D8FF |
| violet | #BCC2FF | #1D2960 | #37458C | #DFE0FF | #C3C5DD | #434659 | #E0E1F9 | #E4BADB | #5D3B56 | #FFD7F3 |
| orchid | #E2B6FD | #45205F | #5D347A | #F3DAFF | #D4C2DB | #504258 | #F0DDF5 | #EFB8C8 | #633B48 | #FFD8E4 |
| sakura | #FFB1C8 | #5E1133 | #7B2949 | #FFD9E2 | #E3BDC6 | #5B3F47 | #FFD9E1 | #E7BE8C | #5E4218 | #FFDCC1 |
| red | #FFB4A8 | #561F16 | #7B2E22 | #FFDAD4 | #E7BDB6 | #5B413C | #FFDAD6 | #E0C38C | #574500 | #F7DFA5 |
| amber | #F5BE48 | #402D00 | #5B4300 | #FFDF9E | #D7C4A0 | #52452C | #F2E0BB | #B0CFA7 | #334D30 | #CCEBC3 |
| olive | #D5D86D | #303300 | #464A00 | #E5EE8A | #C9C9B4 | #484835 | #E6E6CF | #B7C8E2 | #34485F | #D3E3FF |

## 3. 表面阶（`html[data-mode="x"]`）

| token | light | warm（护眼） | dark |
|---|---|---|---|
| surface | #F8FAFC | #FAF6EE | #0F1115 |
| surface-low | #F1F4F8 | #F5F0E5 | #14171C |
| surface-container | #EBEFF4 | #EFE9DC | #1A1E24 |
| surface-high | #E4E9EF | #E8E1D2 | #20252C |
| surface-highest | #DDE3EA | #E1D9C8 | #272C34 |
| on-surface | #111827 | #221E17 | #E2E6EC |
| on-surface-variant | #475569 | #57503F | #B9C2CE |
| outline | #6B7280 | #8A7F68 | #8B95A3 |
| outline-variant | #CBD5E1 | #D8CDB6 | #3A424C |
| shadow-color | `on-surface` | `on-surface` | `surface` |
| manga-filter | none | sepia(.18) brightness(.97) contrast(.98) | brightness(.92) |

## 3.1 Elevation（`:root`）

| token | 值 | 用途 |
|---|---|---|
| `--md-elevation-hover` | `0 6px 16px -10px color-mix(in oklab, var(--md-shadow-color) 52%, transparent)` | 筛选胶囊与侧栏导航项的鼠标悬浮投影 |

## 4. 遗留别名（`:root`，只做映射，新代码别用）

`--brand-primary` → md-primary；`--brand-primary-hover` → color-mix(primary 84%, #000)；
`--brand-shadow` → color-mix(primary 62%, #000)；`--brand-soft` → primary-container；
`--brand-border` → outline-variant；`--brand-on-primary` → on-primary；
`--bg-page` / `--bg-canvas` → surface；`--bg-subtle` → surface-container；`--bg-card` / `--bg-reader` → surface-low；
`--fg-main` → on-surface；`--fg-muted` → on-surface-variant；`--border-line` → outline-variant。

## 5. 组件类清单

| 类名 | 作用 / 关键值 |
|---|---|
| `.md-shelf-grid` | 书架网格：手机 3 列 gap12 pad14/16；768–899 5 列 gap14；≥900 4 列 gap16 pad18/28；≥1080 5 列；≥1280 6 列；≥1600 8 列 gap18 pad36 |
| `.md-featured-cell` | 继续阅读特色卡跨列：手机 span3；768–899 span2；≥900 span3 |
| `.md-shelf-card` | 12px 圆角 + surface-highest；默认无重阴影，鼠标 hover 叠加轻 elevation 与 8% 状态层 |
| `.md-fab-pos` | FAB 定位：桌面 right28/bottom26；手机 right18/bottom `calc(6.5rem + env(safe-area-inset-bottom))` |
| `.md-bottom-nav-space` | 手机底部导航留白 `calc(6.5rem + env(safe-area-inset-bottom))` |
| `.md-scrim` / `.md-scrim-soft` | 遮罩：shadow-color 32% / 30% |
| `.md-sheet-enter-active` 等 | sheet/浮层动效：0.2s cubic-bezier(.2,0,0,1)，含 fade 版 `.md-fade-*` |
| `.md-range` | 滑条：4px 轨道、14px 拇指（触屏 18px）、3px 表面色光环 |
| `.md-icon-button` | 48px 圆形图标按钮；支持 `is-outlined` / `is-filled` / `is-desktop-only` / `is-favorite` |
| `.md-text-button` / `.md-filled-button` / `.md-tonal-button` | 48px 胶囊按钮三档：低强调 / 主行动 / 次要行动 |
| `.md-filter-chip` | 筛选 chip：32px 视觉高度、48px 命中区，选中态 secondary-container |
| `.md-menu` / `.md-menu-item` | 菜单容器与 48px 条目，surface-container + shadow-color |
| `.md-drawer` | 统一抽屉外壳：桌面右侧 372px / 手机底部 78dvh、28px 圆角 |
| `.md-drawer-section` / `.md-drawer-group-head` | 抽屉分组与 label/value 行 |
| `.md-drawer-list-item` / `.md-toc-page` | 目录列表与页码格；当前项使用 secondary-container 对 |
| `.md-hit-target` | 把视觉更小的控件命中区补到至少 44px |
| `.theme-swatch-grid` / `.theme-swatch-tile` | 10 套主题固定 5 列 × 2 行；约 44px 触控块，三阶切面圆点，选中态使用 primary 环与勾选 |
| `.app-dvh` / `.safe-top` / `.safe-bottom` / `.mobile-tabbar` | 视口与安全区 |
| `.card-remove-btn` | 卡片移除按钮：hover 显形，触屏常显 |
| `.manga-page-img` | 漫画页滤镜 `var(--manga-filter)` + GPU 提升 |
| `.book-spine-shadow` | 双页中缝阴影（夜间单独加深） |
| `.reader-gesture-layer` | 阅读手势层 `touch-action: none; overscroll-behavior: contain` |
| `.surface-wipe` | 切换阅读模式时的整屏擦除层（z 9999） |
| `.stage-buffer-layer` | 漫画双缓冲层，`will-change: transform, opacity` |
| `.no-scrollbar` | 隐藏滚动条但可滚动 |

## 6. 主题接入点

| 文件 | 需要改的常量 |
|---|---|
| `src/assets/homura.css` | 10 套 `html[data-theme]` + 10 套 `html[data-mode="dark"][data-theme]` |
| `src/stores/theme.js` | `THEME_OPTIONS`（name / title / 三阶预览色）、`SURFACE_CANVAS`（原生窗口画布色）、`MODE_LABELS` |
| `src/components/ThemeSwatchGrid.vue` | 外观浮层与阅读设置共用的 5×2 主题色板 |
| `index.html` | 首帧恢复脚本里的 `canvases` 与 `theme-color` meta 默认值 |
