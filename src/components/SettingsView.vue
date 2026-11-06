<template>
  <!-- 一级设置页：外观与阅读、存储、关于各自独立成页 -->
  <div class="settings-page">
    <header
      class="settings-topbar z-20 bg-[var(--md-surface)]"
      :style="isCompact ? { paddingTop: 'env(safe-area-inset-top)' } : null"
    >
      <div class="settings-topbar-inner">
        <Transition name="settings-title" appear>
          <h1>设置</h1>
        </Transition>
        <span class="settings-save-state">
          <i aria-hidden="true"></i>
          <span class="save-state-long">更改会自动保存</span>
          <span class="save-state-short">已自动保存</span>
        </span>
      </div>
    </header>

    <div
      class="settings-layout"
      :class="{ 'has-preview': activeSection === 'appearance' }"
    >
      <nav ref="sectionNavRef" class="settings-section-nav" aria-label="设置分区">
        <span
          class="settings-section-indicator"
          :class="{ 'is-ready': sectionIndicatorReady }"
          :style="sectionIndicatorStyle"
          aria-hidden="true"
        ></span>
        <p class="settings-section-label">偏好</p>
        <button
          v-for="section in sections"
          :key="section.key"
          type="button"
          class="settings-section-link"
          :class="{ 'is-active': activeSection === section.key }"
          :aria-current="activeSection === section.key ? 'page' : undefined"
          @click="selectSection(section.key)"
        >
          <MdIcon :name="section.icon" />
          <span class="section-link-desktop">{{ section.label }}</span>
          <span class="section-link-mobile">{{ section.shortLabel }}</span>
        </button>

        <div class="settings-section-foot">
          <b>本地优先</b>
          阅读记录与作品只保存在此设备。
        </div>
      </nav>

      <main class="settings-main">
        <template v-if="activeSection === 'appearance'">
          <section id="settings-appearance" class="settings-section settings-page-panel">
            <div class="settings-section-heading">
              <h2>外观</h2>
              <span>即时应用到整个应用</span>
            </div>

            <div class="settings-block">
              <div class="settings-head">
                <span class="settings-title">表面</span>
                <span class="settings-value">{{ surfaceLabel }}</span>
              </div>
              <SurfaceModePreview />
            </div>

            <div class="settings-block">
              <div class="settings-head">
                <span class="settings-title">主题色</span>
                <span class="settings-value">{{ themeLabel }}</span>
              </div>
              <ThemeSwatchGrid
                wide
                :columns="isCompact ? 5 : 10"
              />
            </div>

            <div class="settings-block">
              <div class="settings-head">
                <span class="settings-title">翻页过渡</span>
                <span class="settings-value">{{ transitionLabel }}</span>
              </div>
              <MdSegmentedControl
                class="w-full"
                :model-value="theme.transitionStyle"
                :options="transitionOptions"
                aria-label="翻页过渡"
                @update:model-value="theme.setTransitionStyle"
              />
            </div>
          </section>

          <section id="settings-reading" class="settings-section settings-page-panel">
            <div class="settings-section-heading">
              <h2>阅读默认值</h2>
              <span>首次打开作品时采用</span>
            </div>

            <div class="settings-block">
              <div class="settings-head">
                <span class="settings-title">阅读方向</span>
                <span class="settings-value">{{ directionLabel }}</span>
              </div>
              <MdSegmentedControl
                class="w-full"
                :model-value="readerDefaults.direction"
                :options="directionOptions"
                aria-label="阅读方向"
                @update:model-value="setDirection"
              />
            </div>

            <div class="settings-block">
              <div class="settings-head">
                <span class="settings-title">跨页布局</span>
                <span class="settings-value">{{ spreadLabel }}</span>
              </div>
              <MdSegmentedControl
                class="w-full"
                :model-value="readerDefaults.spread"
                :options="spreadOptions"
                aria-label="跨页布局"
                @update:model-value="setSpread"
              />
              <MdSwitch
                v-if="readerDefaults.spread === 2"
                class="settings-value-row"
                :model-value="readerDefaults.coverOffset"
                title="让后续跨页大图保持对齐"
                @update:model-value="value => settings.setReaderDefault('coverOffset', value)"
              >
                <span class="settings-value-copy">
                  <b>首页单排</b>
                  <span>让后续跨页大图保持对齐</span>
                </span>
              </MdSwitch>
            </div>

            <div class="settings-block">
              <div class="settings-head">
                <span class="settings-title">默认字号</span>
                <span class="settings-value">{{ readerDefaults.fontSize }} px</span>
              </div>
              <div class="font-size-control">
                <button
                  type="button"
                  class="settings-icon-button"
                  title="减小字号"
                  aria-label="减小字号"
                  :disabled="readerDefaults.fontSize <= 14"
                  @click="changeDefaultFont(-2)"
                >
                  <MdIcon name="remove" />
                </button>
                <MdRange
                  class="settings-range"
                  :model-value="readerDefaults.fontSize"
                  :min="14"
                  :max="28"
                  :step="2"
                  aria-label="默认字号"
                  @update:model-value="setFontSize"
                />
                <button
                  type="button"
                  class="settings-icon-button"
                  title="增大字号"
                  aria-label="增大字号"
                  :disabled="readerDefaults.fontSize >= 28"
                  @click="changeDefaultFont(2)"
                >
                  <MdIcon name="add" />
                </button>
              </div>
            </div>

            <button type="button" class="settings-reset-button" @click="settings.resetReaderDefaults">
              恢复阅读默认值
            </button>
          </section>
        </template>

        <section
          v-else-if="activeSection === 'storage'"
          id="settings-storage"
          class="settings-section settings-page-panel"
        >
          <div class="settings-section-heading">
            <h2>存储与数据</h2>
            <span>WebView 本地数据</span>
          </div>

          <div class="settings-block">
            <div class="storage-overview">
              <strong>{{ storageUsageText }}</strong>
              <span>{{ storageQuotaText }}</span>
              <div
                class="storage-bar"
                role="progressbar"
                aria-label="本地存储用量"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="storagePercent"
              >
                <i :style="{ width: storagePercent + '%' }"></i>
              </div>
            </div>
          </div>

          <div class="settings-block settings-data-list">
            <div class="settings-data-row">
              <span class="settings-data-copy">
                <b>阅读进度</b>
                <span>{{ progressCount }} 本作品保留阅读位置与排版</span>
              </span>
              <button
                type="button"
                class="settings-text-button"
                :disabled="progressCount === 0 || actionBusy"
                @click="requestDataAction('progress')"
              >清空进度</button>
            </div>
            <div class="settings-data-row">
              <span class="settings-data-copy">
                <b>书架与原始文件</b>
                <span>{{ shelf.library.length }} 部作品，删除后无法从 HOMURA 恢复</span>
              </span>
              <button
                type="button"
                class="settings-text-button"
                :disabled="shelf.library.length === 0 || actionBusy"
                @click="requestDataAction('shelf')"
              >清空书架</button>
            </div>
          </div>
          <p v-if="actionNote" class="settings-action-note" role="status">{{ actionNote }}</p>
        </section>

        <section
          v-else-if="activeSection === 'debug'"
          id="settings-debug"
          class="settings-section settings-page-panel"
        >
          <div class="settings-section-heading">
            <h2>调试</h2>
            <span>仅保存在本机</span>
          </div>

          <div class="settings-block">
            <div class="settings-head">
              <span class="settings-title">全屏入口</span>
              <span class="settings-value">{{ isWindows ? 'Windows · 默认显示' : '非 Windows · 默认隐藏' }}</span>
            </div>
            <MdSwitch
              :model-value="settings.debugForceFullscreen"
              title="在非 Windows 系统也显示全屏入口"
              @update:model-value="settings.setDebugForceFullscreen"
            >
              <span class="settings-value-copy">
                <b>强制显示全屏组件</b>
                <span>在阅读器与主页顶栏显示全屏按钮，不受系统限制。</span>
              </span>
            </MdSwitch>
          </div>

          <p class="settings-action-note">关闭后恢复系统默认策略：仅 Windows 显示全屏组件。</p>

          <div class="settings-block">
            <div class="settings-head">
              <span class="settings-title">示例内容</span>
              <span class="settings-value">仅加入本机书架</span>
            </div>
            <div class="settings-data-list">
              <div class="settings-data-row">
                <span class="settings-data-copy">
                  <b>示例漫画</b>
                  <span>6 页分镜样张，用于检查单双页、日漫方向与条漫模式。</span>
                </span>
                <button type="button" class="settings-text-button" @click="addDemoManga">添加</button>
              </div>
              <div class="settings-data-row">
                <span class="settings-data-copy">
                  <b>示例小说</b>
                  <span>2 章 EPUB 样张，用于检查字号、分页与进度恢复。</span>
                </span>
                <button type="button" class="settings-text-button" @click="addDemoNovel">添加</button>
              </div>
            </div>
          </div>

          <p v-if="debugNote" class="settings-action-note" role="status">{{ debugNote }}</p>
        </section>

        <section
          v-else
          id="settings-about"
          class="settings-section settings-page-panel"
        >
          <div class="settings-section-heading">
            <h2>关于</h2>
            <span>版本、更新与开源信息</span>
          </div>
          <div class="about-hero">
            <div class="about-cover">
              <div class="about-cover-top">
                <img class="about-logo" :src="logoUrl" alt="HOMURA 应用图标" />
                <div class="about-brand-copy">
                  <div class="about-eyebrow">LOCAL-FIRST ACGN READER</div>
                  <h3 class="about-wordmark">HOMURA</h3>
                </div>
              </div>
              <div class="about-cover-meta">
                <span class="about-version-badge">v{{ appVersion }}</span>
                <span>稳定版</span>
                <span class="about-local-label"><i aria-hidden="true"></i>本机数据</span>
              </div>
              <p class="about-cover-note">PRIVATE LIBRARY<br />NO CLOUD REQUIRED</p>
            </div>

            <div class="about-story">
              <p class="about-tagline">把故事留在本机，<br /><em>把阅读留给自己。</em></p>
              <p class="about-description">漫画、轻小说与图集的解析、分页和阅读记录都在设备内完成，不上传任何服务器。</p>

              <div class="about-actions">
                <button type="button" class="about-update-button" @click="updates.handlePrimaryUpdateAction">
                  <MdIcon name="update" />
                  {{ hasPendingInstall ? '继续安装' : '检查更新' }}
                </button>
                <button type="button" class="about-log-button" @click="updates.openChangelog">
                  <MdIcon name="article" />
                  更新日志
                  <span v-if="hasNewRelease" class="about-log-new" aria-label="有新版本"></span>
                </button>
              </div>

              <div class="about-foot">
                <span>本地优先</span><i></i>
                <span>无云端依赖</span><i></i>
                <span>Tauri 2 + Vue 3</span>
                <button type="button" @click="openRepository">开源仓库 ↗</button>
              </div>
              <p v-if="aboutLinkError" class="about-link-error" role="alert">{{ aboutLinkError }}</p>
            </div>
          </div>
        </section>
      </main>

      <aside v-if="activeSection === 'appearance'" class="settings-preview" aria-label="阅读预览">
        <div class="settings-preview-head">
          <h3>阅读预览</h3>
          <span>{{ spreadLabel }} · {{ readerDefaults.fontSize }}px</span>
        </div>
        <div class="settings-book-stage">
          <div
            class="settings-open-book"
            :class="{
              'is-single': previewSinglePage,
              'is-rtl': readerDefaults.direction === 'rtl',
              'is-vertical': readerDefaults.direction === 'vertical'
            }"
          >
            <div class="settings-book-page is-left">
              <div class="settings-book-kicker">CHAPTER 03</div>
              <div class="settings-book-art" aria-hidden="true"></div>
              <h3 class="settings-book-title">星降之夜的<br />观测者</h3>
              <p class="settings-book-subtitle">风穿过书架，也穿过没有睡意的夜晚。</p>
              <span class="settings-book-page-no">036</span>
            </div>
            <div class="settings-book-page is-right">
              <p class="settings-book-copy" :style="previewCopyStyle">她把最后一册放回木架，窗外的城市已经沉进深蓝色的雾里。</p>
              <p class="settings-book-copy" :style="previewCopyStyle">远处有一座亮着灯的塔。每当纸页翻动，那束光就轻轻晃一下，像在回答一段只有书才听得见的暗号。</p>
              <p class="settings-book-copy" :style="previewCopyStyle">于是她关掉台灯，任月光落在未完的那一页上。</p>
              <span class="settings-book-page-no">037</span>
            </div>
          </div>
        </div>
        <div class="settings-preview-meta">
          <span>{{ themeLabel }}</span><i></i>
          <span>{{ surfaceLabel }}</span><i></i>
          <span>{{ layoutPreviewLabel }}</span>
        </div>
        <p class="settings-preview-note">设置会被记住。每本书首次打开时，从这里开始。</p>
      </aside>
    </div>

    <Teleport to="body">
      <Transition
        enter-active-class="settings-dialog-enter-active"
        enter-from-class="settings-dialog-enter"
        enter-to-class="settings-dialog-enter-to"
        leave-active-class="settings-dialog-leave-active"
        leave-from-class="settings-dialog-leave-from"
        leave-to-class="settings-dialog-leave-to"
      >
        <div
          v-if="pendingAction"
          class="settings-dialog-layer"
          @mousedown.self="closeDataDialog"
        >
          <section
            class="settings-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            aria-describedby="settings-dialog-copy"
            :aria-busy="actionBusy"
          >
            <div class="settings-dialog-icon" aria-hidden="true">
              <MdIcon name="delete" />
            </div>
            <h3 id="settings-dialog-title">{{ dataDialogTitle }}</h3>
            <p id="settings-dialog-copy">{{ dataDialogDescription }}</p>
            <div class="settings-dialog-actions">
              <button
                ref="cancelButtonRef"
                type="button"
                class="settings-dialog-button is-secondary"
                :disabled="actionBusy"
                @click="closeDataDialog"
              >取消</button>
              <button
                ref="confirmButtonRef"
                type="button"
                class="settings-dialog-button is-primary"
                :disabled="actionBusy"
                @click="confirmDataAction"
              >{{ actionBusy ? '正在清空' : '确认清空' }}</button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import packageInfo from '../../package.json';
import { createDemoManga, createDemoNovel } from '../services/demo.js';
import { HomuraStore } from '../services/storage.js';
import { formatBytes, isWindows } from '../services/platform.js';
import { openGitHubUrl } from '../services/external.js';
import { REPOSITORY_URL } from '../services/updates.js';
import { scrollAppToTop } from '../services/utils.js';
import { useShelfStore } from '../stores/shelf.js';
import { useSettingsStore } from '../stores/settings.js';
import {
  SURFACE_MODE_OPTIONS,
  THEME_OPTIONS,
  TRANSITION_LABELS,
  TRANSITION_OPTIONS,
  useThemeStore
} from '../stores/theme.js';
import { useUpdateStore } from '../stores/updates.js';
import { useViewport } from '../composables/useViewport.js';
import MdIcon from './MdIcon.vue';
import MdRange from './MdRange.vue';
import MdSegmentedControl from './MdSegmentedControl.vue';
import MdSwitch from './MdSwitch.vue';
import SurfaceModePreview from './SurfaceModePreview.vue';
import ThemeSwatchGrid from './ThemeSwatchGrid.vue';

const logoUrl = import.meta.env.BASE_URL + 'favicon.png';
const shelf = useShelfStore();
const settings = useSettingsStore();
const theme = useThemeStore();
const updates = useUpdateStore();
const { hasNewRelease, hasPendingInstall } = storeToRefs(updates);
const appVersion = packageInfo.version;
const { isCompact } = useViewport();
const readerDefaults = settings.readerDefaults;
const aboutLinkError = ref('');
const debugNote = ref('');

const transitionOptions = TRANSITION_OPTIONS;
const directionOptions = [
  { value: 'ltr', label: '从左到右', title: '普通排版' },
  { value: 'rtl', label: '从右到左', title: '日漫' },
  { value: 'vertical', label: '条漫模式', title: '条漫长卷' }
];
const spreadOptions = [
  { value: 1, label: '单页' },
  { value: 2, label: '双页' }
];

const sections = [
  { key: 'appearance', label: '外观与阅读', shortLabel: '外观', icon: 'palette' },
  { key: 'storage', label: '存储与数据', shortLabel: '存储', icon: 'database' },
  { key: 'debug', label: '调试', shortLabel: '调试', icon: 'science' },
  { key: 'about', label: '关于 HOMURA', shortLabel: '关于', icon: 'info' }
];
const activeSection = ref('appearance');

const sectionNavRef = ref(null);
const sectionIndicatorReady = ref(false);
const sectionIndicator = ref({ x: 0, y: 0, width: 0, height: 0 });
const sectionIndicatorStyle = computed(() => ({
  transform: `translate3d(${sectionIndicator.value.x}px, ${sectionIndicator.value.y}px, 0)`,
  width: `${sectionIndicator.value.width}px`,
  height: `${sectionIndicator.value.height}px`
}));

let sectionMeasureFrame = 0;

function measureSectionIndicator() {
  const nav = sectionNavRef.value;
  const active = nav?.querySelector('.settings-section-link.is-active');
  if (!active) return;
  const navRect = nav.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  sectionIndicator.value = {
    x: activeRect.left - navRect.left + nav.scrollLeft,
    y: activeRect.top - navRect.top + nav.scrollTop,
    width: activeRect.width,
    height: activeRect.height
  };
  if (!sectionIndicatorReady.value) {
    requestAnimationFrame(() => {
      sectionIndicatorReady.value = true;
    });
  }
}

function scheduleSectionMeasure() {
  cancelAnimationFrame(sectionMeasureFrame);
  sectionMeasureFrame = requestAnimationFrame(measureSectionIndicator);
}

const themeLabel = computed(() => {
  const option = THEME_OPTIONS.find(item => item.name === theme.themeColor);
  return option ? option.title.replace(' (默认)', '') : theme.themeColor;
});
const surfaceLabel = computed(() => {
  const option = SURFACE_MODE_OPTIONS.find(item => item.value === theme.surfaceMode);
  return option ? option.label : theme.surfaceMode;
});
const transitionLabel = computed(() => TRANSITION_LABELS[theme.transitionStyle] || '');
const directionLabel = computed(() => {
  const option = directionOptions.find(item => item.value === readerDefaults.direction);
  return option ? option.label : '';
});
const spreadLabel = computed(() => readerDefaults.spread === 2 ? '双页' : '单页');
const previewSinglePage = computed(() =>
  readerDefaults.spread === 1 || readerDefaults.direction === 'vertical'
);
const layoutPreviewLabel = computed(() =>
  readerDefaults.direction === 'vertical' ? '长卷' : spreadLabel.value
);
const previewCopyStyle = computed(() => ({
  fontSize: `${Math.min(10.5, Math.max(7.8, readerDefaults.fontSize * 0.46))}px`,
  lineHeight: readerDefaults.direction === 'vertical' ? 1.9 : 2.12
}));

const storageInfo = ref(null);
const storageLoading = ref(true);
const actionNote = ref('');
const pendingAction = ref(null);
const actionBusy = ref(false);
const cancelButtonRef = ref(null);
const confirmButtonRef = ref(null);
let dialogTrigger = null;
const modalLayerOpen = computed(() => !!pendingAction.value);
let previousModalBodyOverflow = '';
let modalLayerLocked = false;

const storageUsageText = computed(() => {
  if (storageLoading.value) return '正在读取';
  if (!storageInfo.value) return '无法估算';
  return formatBytes(storageInfo.value.usage || 0);
});
const storageQuotaText = computed(() => {
  if (storageLoading.value) return '';
  if (!storageInfo.value || !storageInfo.value.quota) return '当前环境未提供容量信息';
  const free = Math.max(0, storageInfo.value.quota - storageInfo.value.usage);
  return `可用 ${formatBytes(free)}`;
});
const storagePercent = computed(() => {
  const ratio = storageInfo.value && storageInfo.value.ratio;
  return Number.isFinite(ratio) ? Math.min(100, Math.max(0, Math.round(ratio * 100))) : 0;
});
const progressCount = computed(() => Object.keys(shelf.progressMap || {}).length);
const dataDialogTitle = computed(() =>
  pendingAction.value === 'shelf' ? '清空书架与原始文件？' : '清空阅读进度？'
);
const dataDialogDescription = computed(() => {
  if (pendingAction.value === 'shelf') {
    return `将删除 ${shelf.library.length} 部作品、原始文件与阅读记录。此操作无法撤销。`;
  }
  return `将删除 ${progressCount.value} 本作品的阅读位置与排版记忆。作品本身不会被删除。`;
});

function setDirection(value) {
  settings.setReaderDefault('direction', value);
}

function setSpread(value) {
  settings.setReaderDefault('spread', Number(value));
}

function setFontSize(value) {
  settings.setReaderDefault('fontSize', Number(value));
}

function changeDefaultFont(delta) {
  settings.setReaderDefault('fontSize', readerDefaults.fontSize + delta);
}

async function refreshStorage() {
  storageLoading.value = true;
  storageInfo.value = await HomuraStore.estimateStorage();
  storageLoading.value = false;
}

async function openRepository() {
  aboutLinkError.value = '';
  try {
    await openGitHubUrl(REPOSITORY_URL);
  } catch (error) {
    aboutLinkError.value = '无法打开系统浏览器，请稍后再试。';
    console.warn('打开开源仓库失败', error);
  }
}

async function selectSection(key) {
  if (activeSection.value === key) return;
  activeSection.value = key;
  debugNote.value = '';
  if (key === 'storage') refreshStorage();
  await nextTick();
  scrollAppToTop('auto');
}

function addDemoManga() {
  const book = createDemoManga();
  shelf.unshiftBook(book);
  debugNote.value = `已添加「${book.title}」`;
}

function addDemoNovel() {
  const book = createDemoNovel();
  shelf.unshiftBook(book);
  debugNote.value = `已添加「${book.title}」`;
}

function requestDataAction(action) {
  if (actionBusy.value) return;
  dialogTrigger = document.activeElement;
  pendingAction.value = action;
}

function closeDataDialog() {
  if (actionBusy.value) return;
  pendingAction.value = null;
}

async function confirmDataAction() {
  if (!pendingAction.value || actionBusy.value) return;
  const action = pendingAction.value;
  actionBusy.value = true;
  try {
    if (action === 'shelf') {
      await shelf.clearShelf();
      actionNote.value = '书架与原始文件已清空';
    } else {
      await shelf.clearProgress();
      actionNote.value = '阅读进度已清空';
    }
  } catch (err) {
    actionNote.value = err.message || '清空失败，请重试';
    console.warn('[HOMURA] 清空数据失败', err);
  } finally {
    await refreshStorage();
    actionBusy.value = false;
    pendingAction.value = null;
  }
}

function onDialogKeydown(event) {
  if (!pendingAction.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDataDialog();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [cancelButtonRef.value, confirmButtonRef.value].filter(Boolean);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(pendingAction, async (value, previous) => {
  if (value) {
    await nextTick();
    cancelButtonRef.value?.focus();
    return;
  }
  if (previous) {
    await nextTick();
    if (dialogTrigger && typeof dialogTrigger.focus === 'function') dialogTrigger.focus();
    dialogTrigger = null;
  }
});

watch(modalLayerOpen, open => {
  if (open && !modalLayerLocked) {
    previousModalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalLayerLocked = true;
    return;
  }
  if (!open && modalLayerLocked) {
    document.body.style.overflow = previousModalBodyOverflow;
    modalLayerLocked = false;
  }
});

watch(activeSection, () => nextTick(measureSectionIndicator));
watch(isCompact, () => nextTick(scheduleSectionMeasure));

onMounted(() => {
  refreshStorage();
  measureSectionIndicator();
  document.fonts?.ready.then(measureSectionIndicator);
  window.addEventListener('resize', scheduleSectionMeasure);
  window.addEventListener('keydown', onDialogKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleSectionMeasure);
  cancelAnimationFrame(sectionMeasureFrame);
  window.removeEventListener('keydown', onDialogKeydown);
  if (modalLayerLocked) document.body.style.overflow = previousModalBodyOverflow;
});
</script>

<style scoped>
.settings-page {
  width: 100%;
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.settings-topbar {
  position: sticky;
  top: 0;
}

.settings-topbar-inner {
  padding: 0 16px;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-topbar h1 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  font-size: 21px;
  font-weight: 500;
  letter-spacing: -0.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-title-enter-active {
  transition:
    opacity 180ms var(--md-ease-emphasized),
    transform 180ms var(--md-ease-emphasized);
}

.settings-title-enter-from {
  opacity: 0;
  transform: translate3d(-12px, 0, 0);
}

.settings-save-state {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.settings-save-state i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--md-primary);
}

.save-state-short {
  display: none;
}

.settings-layout {
  width: 100%;
  max-width: 1220px;
  margin: 0 auto;
  padding: 18px 38px 72px;
  display: grid;
  grid-template-columns: 160px minmax(440px, 1fr) 332px;
  gap: 34px;
  align-items: start;
}

.settings-layout:not(.has-preview) {
  grid-template-columns: 160px minmax(0, 1fr);
}

.settings-section-nav {
  position: sticky;
  top: 84px;
  padding-top: 4px;
}

.settings-section-indicator {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  border-radius: 12px;
  background: var(--md-secondary-container);
  opacity: 0;
  pointer-events: none;
}

.settings-section-indicator.is-ready {
  opacity: 1;
  transition:
    transform 300ms var(--md-ease-emphasized),
    width 300ms var(--md-ease-emphasized),
    height 300ms var(--md-ease-emphasized),
    opacity 120ms var(--md-ease-emphasized);
}

.settings-section-label {
  margin: 0 0 12px 12px;
  color: var(--md-on-surface-variant);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.settings-section-link {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--md-on-surface-variant);
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  font-size: 13px;
  font-weight: 570;
  cursor: pointer;
  transition:
    background-color var(--md-duration-short) var(--md-ease-emphasized),
    color var(--md-duration-short) var(--md-ease-emphasized);
}

.settings-section-link + .settings-section-link {
  margin-top: 2px;
}

.settings-section-link svg {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  opacity: 0.72;
}

.settings-section-link:hover {
  background: var(--md-surface-container);
}

.settings-section-link.is-active {
  background: transparent;
  color: var(--md-on-secondary-container);
}

.settings-section-link.is-active svg {
  opacity: 1;
}

.section-link-mobile {
  display: none;
}

.settings-section-foot {
  margin: 28px 12px 0;
  padding-top: 15px;
  border-top: 0.5px solid var(--md-outline-variant);
  color: var(--md-on-surface-variant);
  font-size: 11px;
  line-height: 1.7;
}

.settings-section-foot b {
  display: block;
  color: var(--md-on-surface);
  font-weight: 620;
}

.settings-main {
  min-width: 0;
}

.settings-page-panel {
  animation: settings-page-enter 200ms var(--md-ease-emphasized);
}

@keyframes settings-page-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-section {
  padding-bottom: 34px;
  scroll-margin-top: 84px;
}

.settings-section + .settings-section {
  padding-top: 30px;
  border-top: 0.5px solid var(--md-outline-variant);
}

.settings-section-heading {
  margin: 0 0 22px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
}

.settings-section-heading h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.settings-section-heading span {
  color: var(--md-on-surface-variant);
  font-size: 12px;
  white-space: nowrap;
}

.settings-block + .settings-block {
  margin-top: 25px;
}

.settings-action-note + .settings-block {
  margin-top: 25px;
}

.settings-head {
  min-height: 24px;
  margin-bottom: 11px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
}

.settings-title {
  font-size: 13px;
  font-weight: 620;
}

.settings-value {
  color: var(--md-on-surface-variant);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
}

.settings-value-row {
  margin-top: 12px;
  border-top: 0.5px solid var(--md-outline-variant);
}

.settings-value-copy {
  min-width: 0;
}

.settings-value-copy b {
  display: block;
  font-size: 13px;
  font-weight: 580;
}

.settings-value-copy span {
  display: block;
  margin-top: 3px;
  color: var(--md-on-surface-variant);
  font-size: 11px;
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 14px;
}

.settings-icon-button {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--md-surface-high);
  color: var(--md-on-surface);
  cursor: pointer;
  transition: background-color var(--md-duration-short) var(--md-ease-emphasized);
}

.settings-icon-button:hover:not(:disabled) {
  background: var(--md-surface-highest);
}

.settings-icon-button:disabled {
  opacity: 0.42;
  cursor: default;
}

.settings-icon-button svg {
  width: 18px;
  height: 18px;
}

.settings-range {
  width: 100%;
  min-width: 0;
  flex: 1;
}

.settings-reset-button {
  min-height: 44px;
  margin-top: 16px;
  padding: 0 14px;
  border: 0;
  border-radius: 20px;
  background: transparent;
  color: var(--md-primary);
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
}

.settings-reset-button:hover {
  background: var(--md-surface-container);
}

.storage-overview {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px 18px;
  align-items: baseline;
}

.storage-overview strong {
  font-size: 17px;
  font-weight: 640;
}

.storage-overview span {
  color: var(--md-on-surface-variant);
  font-size: 12px;
}

.storage-bar {
  grid-column: 1 / -1;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--md-surface-high);
}

.storage-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--md-primary);
  transition: width var(--md-duration-medium) var(--md-ease-emphasized);
}

.settings-data-list {
  margin-top: 14px;
}

.settings-data-row {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-top: 0.5px solid var(--md-outline-variant);
}

.settings-data-copy {
  min-width: 0;
}

.settings-data-copy b {
  display: block;
  font-size: 13px;
  font-weight: 590;
}

.settings-data-copy span {
  display: block;
  margin-top: 4px;
  color: var(--md-on-surface-variant);
  font-size: 11px;
}

.settings-text-button {
  min-height: 36px;
  flex: 0 0 auto;
  padding: 0 14px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: var(--md-primary);
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
}

.settings-text-button:hover:not(:disabled) {
  background: var(--md-surface-container);
}

.settings-text-button:disabled {
  opacity: 0.42;
  cursor: default;
}

.settings-action-note {
  margin: 11px 0 0;
  color: var(--md-on-surface-variant);
  font-size: 12px;
}

.about-hero {
  position: relative;
  isolation: isolate;
  padding: 14px;
  overflow: hidden;
  border-radius: 28px;
  background: var(--md-surface-container);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--md-outline-variant) 72%, transparent);
}

.about-cover {
  position: relative;
  isolation: isolate;
  display: flex;
  min-height: 260px;
  flex-direction: column;
  padding: 24px 24px 22px 28px;
  overflow: hidden;
  border-radius: 22px;
  background:
    radial-gradient(
      120% 110% at 100% 0%,
      color-mix(in oklab, var(--md-secondary-container) 82%, transparent),
      transparent 61%
    ),
    linear-gradient(
      150deg,
      var(--md-primary-container),
      color-mix(in oklab, var(--md-primary-container) 86%, var(--md-tertiary-container))
    );
  color: var(--md-on-primary-container);
}

.about-cover::before {
  content: "";
  position: absolute;
  z-index: -1;
  width: 230px;
  height: 230px;
  right: -116px;
  bottom: -124px;
  border: 1px solid color-mix(in oklab, var(--md-on-primary-container) 18%, transparent);
  border-radius: 50%;
  box-shadow:
    0 0 0 24px color-mix(in oklab, var(--md-secondary-container) 26%, transparent),
    0 0 0 58px color-mix(in oklab, var(--md-secondary-container) 14%, transparent);
}

.about-cover::after {
  content: "";
  position: absolute;
  z-index: -1;
  top: 22px;
  bottom: 22px;
  left: 11px;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    var(--md-primary),
    color-mix(in oklab, var(--md-tertiary) 62%, var(--md-primary))
  );
  opacity: 0.74;
}

.about-cover-top {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.about-logo {
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow:
    0 1px 2px color-mix(in oklab, var(--md-shadow-color) 18%, transparent),
    0 10px 24px -14px color-mix(in oklab, var(--md-shadow-color) 55%, transparent);
}

.about-brand-copy {
  min-width: 0;
  flex: 1;
}

.about-eyebrow {
  color: inherit;
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.12em;
  opacity: 0.72;
}

.about-wordmark {
  margin: 5px 0 0;
  font-size: 40px;
  font-weight: 700;
  line-height: 0.98;
  letter-spacing: -0.065em;
}

.about-cover-meta {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.about-version-badge {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--md-surface-container);
  color: var(--md-on-surface);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 650;
}

.about-local-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.about-local-label i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}

.about-cover-note {
  margin: 15px 0 0;
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.65;
  letter-spacing: 0.12em;
  opacity: 0.56;
}

.about-story {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  padding: 24px 20px 10px;
}

.about-tagline {
  max-width: 22ch;
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  line-height: 1.42;
  letter-spacing: -0.025em;
}

.about-tagline em {
  color: var(--md-primary);
  font-style: normal;
}

.about-description {
  max-width: 50ch;
  margin: 12px 0 0;
  color: var(--md-on-surface-variant);
  font-size: 13px;
  line-height: 1.7;
}

.about-actions {
  margin-top: 26px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
}

.about-update-button,
.about-log-button {
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 24px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--md-duration-short) var(--md-ease-emphasized),
    color var(--md-duration-short) var(--md-ease-emphasized);
}

.about-update-button {
  padding: 0 22px;
  border: 0;
  background: var(--md-primary);
  color: var(--md-on-primary);
}

.about-update-button:hover {
  background: color-mix(in oklab, var(--md-primary) 92%, var(--md-on-primary));
}

.about-update-button svg,
.about-log-button svg {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}

.about-log-button {
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--md-primary);
}

.about-log-button:hover {
  background: color-mix(in oklab, var(--md-primary) 8%, transparent);
}

.about-log-new {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--md-primary);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--md-primary) 12%, transparent);
}

.about-foot {
  margin-top: 22px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in oklab, var(--md-outline-variant) 72%, transparent);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px 10px;
  color: var(--md-on-surface-variant);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
}

.about-foot i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.42;
}

.about-foot button {
  min-height: 44px;
  margin-left: auto;
  padding: 0 10px;
  border: 0;
  border-radius: 22px;
  background: transparent;
  color: var(--md-primary);
  font-family: var(--font-sans, system-ui), -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.about-foot button:hover {
  background: color-mix(in oklab, var(--md-primary) 8%, transparent);
}

.about-link-error {
  margin: 9px 0 0;
  color: var(--md-primary);
  font-size: 10.5px;
}

.settings-preview {
  position: sticky;
  top: 84px;
  padding: 18px;
  border-radius: 24px;
  background:
    radial-gradient(120% 88% at 88% 0%, color-mix(in oklab, var(--md-primary) 14%, transparent), transparent 58%),
    var(--md-surface-low);
  box-shadow:
    inset 0 0 0 0.5px color-mix(in oklab, var(--md-outline-variant) 68%, transparent),
    0 18px 50px -34px color-mix(in oklab, var(--md-shadow-color) 44%, transparent);
}

.settings-preview-head {
  padding: 1px 2px 14px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.settings-preview-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
}

.settings-preview-head span {
  color: var(--md-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.settings-book-stage {
  position: relative;
  min-height: 382px;
  padding: 30px 20px 36px;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(160deg, color-mix(in oklab, var(--md-primary) 10%, var(--md-surface-container)), var(--md-surface-container));
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-book-stage::before {
  content: "";
  position: absolute;
  width: 210px;
  height: 210px;
  right: -92px;
  top: -92px;
  border: 0.5px solid color-mix(in oklab, var(--md-primary) 18%, transparent);
  border-radius: 50%;
  box-shadow:
    0 0 0 22px color-mix(in oklab, var(--md-primary) 4%, transparent),
    0 0 0 50px color-mix(in oklab, var(--md-primary) 3%, transparent);
}

.settings-open-book {
  position: relative;
  width: 252px;
  height: 316px;
  border-radius: 7px 10px 10px 7px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
  color: var(--md-on-surface);
  background: color-mix(in oklab, var(--md-surface) 88%, var(--md-primary-container));
  box-shadow:
    0 2px 3px color-mix(in oklab, var(--md-shadow-color) 14%, transparent),
    0 20px 34px -18px color-mix(in oklab, var(--md-shadow-color) 42%, transparent);
  transform: rotate(-1.2deg);
  transition: width var(--md-duration-medium) var(--md-ease-emphasized);
}

.settings-open-book::before {
  content: "";
  position: absolute;
  z-index: 4;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 16px;
  transform: translateX(-50%);
  background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--md-on-surface) 11%, transparent), transparent);
  pointer-events: none;
}

.settings-open-book.is-single {
  width: 210px;
  grid-template-columns: 1fr;
}

.settings-open-book.is-single::before,
.settings-open-book.is-single .is-right {
  display: none;
}

.settings-open-book.is-rtl .settings-book-copy {
  text-align: right;
}

.settings-book-page {
  position: relative;
  min-width: 0;
  padding: 21px 16px 18px;
  overflow: hidden;
}

.settings-book-page.is-left {
  padding-right: 12px;
}

.settings-book-page.is-right {
  padding-left: 12px;
}

.settings-book-page.is-left::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 72%, color-mix(in oklab, var(--md-on-surface) 5%, transparent));
  pointer-events: none;
}

.settings-book-page.is-right::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, color-mix(in oklab, var(--md-on-surface) 5%, transparent), transparent 28%);
  pointer-events: none;
}

.settings-book-kicker {
  color: color-mix(in oklab, var(--md-on-surface) 56%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 7px;
  letter-spacing: 0.08em;
}

.settings-book-art {
  position: relative;
  height: 116px;
  margin: 12px 0 19px;
  overflow: hidden;
  border-radius: 3px;
  background: linear-gradient(to top, color-mix(in oklab, var(--md-primary) 33%, var(--md-primary-container)), color-mix(in oklab, var(--md-primary-container) 68%, var(--md-surface)));
}

.settings-book-art::before {
  content: "";
  position: absolute;
  width: 55px;
  height: 55px;
  top: 18px;
  right: 15px;
  border-radius: 50%;
  background: color-mix(in oklab, var(--md-surface) 84%, var(--md-primary-container));
  box-shadow: 0 0 0 9px color-mix(in oklab, var(--md-surface) 12%, transparent);
}

.settings-book-art::after {
  content: "";
  position: absolute;
  left: -9px;
  right: -9px;
  bottom: 17px;
  height: 42px;
  border-radius: 50% 50% 0 0;
  background: color-mix(in oklab, var(--md-primary) 52%, var(--md-on-primary-container));
  transform: rotate(-4deg);
}

.settings-book-title {
  margin: 0;
  font-family: "Songti SC", "STSong", "Noto Serif SC", serif;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.42;
  letter-spacing: 0.04em;
}

.settings-book-subtitle {
  margin: 7px 0 0;
  color: color-mix(in oklab, var(--md-on-surface) 62%, transparent);
  font-size: 8px;
  line-height: 1.6;
}

.settings-book-copy {
  margin: 0;
  color: color-mix(in oklab, var(--md-on-surface) 82%, transparent);
  font-family: "Songti SC", "STSong", "Noto Serif SC", serif;
  text-align: justify;
}

.settings-book-copy + .settings-book-copy {
  margin-top: 2px;
  text-indent: 2em;
}

.settings-book-page-no {
  position: absolute;
  right: 16px;
  bottom: 10px;
  color: color-mix(in oklab, var(--md-on-surface) 44%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 6.5px;
}

.settings-preview-meta {
  padding: 14px 4px 1px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--md-on-surface-variant);
  font-size: 11px;
}

.settings-preview-meta i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.48;
}

.settings-preview-note {
  margin: 0 4px;
  padding-top: 12px;
  color: var(--md-on-surface-variant);
  font-size: 11px;
  line-height: 1.7;
}

.settings-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 70;
  padding: 24px;
  background: color-mix(in oklab, var(--md-shadow-color) 38%, transparent);
  display: grid;
  place-items: center;
}

.settings-dialog {
  width: min(420px, 100%);
  padding: 24px;
  border-radius: 28px;
  background: var(--md-surface-container);
  color: var(--md-on-surface);
  box-shadow: 0 24px 64px -24px color-mix(in oklab, var(--md-shadow-color) 56%, transparent);
}

.settings-dialog-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}

.settings-dialog-icon svg {
  width: 21px;
  height: 21px;
}

.settings-dialog h3 {
  margin: 18px 0 8px;
  font-size: 17px;
  font-weight: 650;
}

.settings-dialog p {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-size: 13px;
  line-height: 1.65;
}

.settings-dialog-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.settings-dialog-button {
  min-height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: 22px;
  font-size: 13px;
  font-weight: 620;
  cursor: pointer;
}

.settings-dialog-button.is-secondary {
  background: transparent;
  color: var(--md-primary);
}

.settings-dialog-button.is-secondary:hover:not(:disabled) {
  background: var(--md-surface-high);
}

.settings-dialog-button.is-primary {
  background: var(--md-primary);
  color: var(--md-on-primary);
}

.settings-dialog-button:disabled {
  opacity: 0.56;
  cursor: default;
}

.settings-dialog-enter-active,
.settings-dialog-leave-active {
  transition: opacity var(--md-duration-short) var(--md-ease-emphasized);
}

.settings-dialog-enter-active .settings-dialog,
.settings-dialog-leave-active .settings-dialog {
  transition:
    transform var(--md-duration-short) var(--md-ease-emphasized),
    opacity var(--md-duration-short) var(--md-ease-emphasized);
}

.settings-dialog-enter,
.settings-dialog-leave-to {
  opacity: 0;
}

.settings-dialog-enter .settings-dialog,
.settings-dialog-leave-to .settings-dialog {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.settings-dialog-enter-to,
.settings-dialog-leave-from {
  opacity: 1;
}

@media (min-width: 900px) and (max-width: 1199px) {
  .settings-layout,
  .settings-layout:not(.has-preview) {
    grid-template-columns: 148px minmax(0, 1fr);
    gap: 28px;
  }

  .settings-preview {
    display: none;
  }
}

@media (min-width: 900px) {
  .settings-topbar-inner {
    padding: 0 28px;
    gap: 12px;
  }

  .settings-topbar h1 {
    font-size: 22px;
  }

  .settings-save-state {
    font-size: 12px;
  }

  .settings-layout:not(.has-preview) .settings-main {
    max-width: 760px;
  }
}

@media (min-width: 1200px) {
  .about-hero {
    display: grid;
    grid-template-columns: minmax(218px, 0.82fr) minmax(0, 1.18fr);
  }

  .about-cover {
    min-height: 332px;
  }

  .about-story {
    padding: 22px 22px 12px 26px;
  }
}

@media (max-width: 899px) {
  .settings-topbar-inner {
    height: 56px;
  }

  .save-state-long {
    display: none;
  }

  .save-state-short {
    display: inline;
  }

  .settings-layout {
    display: block;
    padding: 8px 16px 28px;
  }

  .settings-section-nav {
    position: relative;
    top: auto;
    padding: 3px 0 14px;
    display: flex;
    gap: 7px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .settings-section-nav::-webkit-scrollbar {
    display: none;
  }

  .settings-section-label,
  .settings-section-foot {
    display: none;
  }

  .settings-section-link {
    width: auto;
    min-height: 44px;
    padding: 0 13px;
    flex: none;
    border: 0.5px solid var(--md-outline-variant);
  }

  .settings-section-link + .settings-section-link {
    margin-top: 0;
  }

  .settings-section-link.is-active {
    border-color: transparent;
  }

  .section-link-desktop {
    display: none;
  }

  .section-link-mobile {
    display: inline;
  }

  .settings-section {
    padding-bottom: 28px;
    scroll-margin-top: 74px;
  }

  .settings-section + .settings-section {
    padding-top: 24px;
  }

  .settings-section-heading {
    margin-bottom: 18px;
  }

  .settings-preview {
    display: none;
  }

  .settings-data-row {
    min-height: 64px;
  }

  .settings-text-button {
    min-height: 44px;
  }

  .about-hero {
    display: block;
    padding: 10px;
    border-radius: 24px;
  }

  .about-cover {
    min-height: 196px;
    padding: 18px 18px 16px 22px;
    border-radius: 18px;
  }

  .about-cover::before {
    width: 184px;
    height: 184px;
    right: -82px;
    bottom: -104px;
  }

  .about-cover::after {
    top: 16px;
    bottom: 16px;
    left: 9px;
  }

  .about-cover-top {
    gap: 12px;
  }

  .about-logo {
    width: 48px;
    height: 48px;
    flex-basis: 48px;
    border-radius: 14px;
  }

  .about-wordmark {
    margin-top: 4px;
    font-size: 34px;
  }

  .about-cover-note {
    margin-top: 12px;
  }

  .about-story {
    padding: 20px 10px 8px;
  }

  .about-tagline {
    font-size: 21px;
  }

  .about-actions {
    margin-top: 22px;
    gap: 7px;
  }

  .about-update-button {
    flex: 1;
    min-width: 162px;
    padding: 0 17px;
  }

  .about-log-button {
    padding: 0 12px;
  }

  .about-foot {
    margin-top: 20px;
    padding-top: 12px;
    gap: 7px 9px;
  }

  .about-foot button {
    width: auto;
    min-height: 44px;
    margin: 2px 0 0 -10px;
  }

  .settings-dialog-layer {
    padding: 16px;
    align-items: end;
  }

  .settings-dialog {
    padding: 22px;
    border-radius: 28px 28px 20px 20px;
  }
}

@media (min-width: 600px) and (max-width: 899px) {
  .about-update-button {
    flex: none;
  }

  .about-foot button {
    margin-left: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-section-link,
  .settings-section-indicator.is-ready,
  .settings-page-panel,
  .settings-icon-button,
  .storage-bar i,
  .settings-open-book,
  .about-update-button,
  .about-log-button,
  .settings-title-enter-active,
  .settings-dialog-enter-active,
  .settings-dialog-leave-active,
  .settings-dialog-enter-active .settings-dialog,
  .settings-dialog-leave-active .settings-dialog {
    transition: none !important;
    animation: none !important;
  }

  .settings-title-enter-from {
    transform: none;
  }
}
</style>
