<template>
  <Teleport to="body">
    <Transition name="update-dialog">
      <div
        v-if="open"
        class="update-dialog-layer"
        @mousedown.self="$emit('close')"
      >
        <section
          ref="dialogRef"
          class="update-dialog-panel"
          :class="{
            'is-progress': status === 'downloading',
            'is-complete': status === 'downloaded',
            'is-download-error': status === 'download-error'
          }"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-dialog-title"
          :aria-busy="status === 'loading' || status === 'downloading'"
          tabindex="-1"
        >
          <template v-if="status === 'downloading'">
            <h2 id="update-dialog-title" class="update-download-title">正在下载更新</h2>
            <p class="update-download-subtitle">
              HOMURA v{{ release?.version || currentVersion }} ·
              {{ download.packageLabel || packageInfo.label }}
            </p>

            <div class="update-download-progress">
              <div
                class="update-download-track"
                role="progressbar"
                aria-label="更新下载进度"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="Math.round(downloadPercent * 10) / 10"
              >
                <i :style="{ width: `${downloadPercent}%` }"></i>
              </div>
              <p>{{ downloadPercentLabel }}</p>
            </div>

            <div class="update-download-actions">
              <button
                ref="cancelDownloadButtonRef"
                type="button"
                class="update-dialog-text-button"
                @click="$emit('cancel-download')"
              >取消</button>
            </div>
          </template>

          <template v-else-if="status === 'downloaded'">
            <h2 id="update-dialog-title" class="update-download-title">下载完成</h2>

            <div class="update-download-complete-status">
              <span class="update-download-check" aria-hidden="true">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="m5 12.5 4.2 4.2L19 7"/>
                </svg>
              </span>
              <span class="update-download-complete-copy">
                <b>新版本 v{{ download.version }} 已下载完成</b>
                <span>{{ installWarning }}</span>
              </span>
            </div>

            <div class="update-download-file">
              <span>文件位置</span>
              <code><template v-for="(part, index) in downloadPathParts" :key="`${index}-${part}`">{{ part }}<wbr v-if="part === '/' || part === '\\'" /></template></code>
            </div>

            <div class="update-download-complete-actions">
              <button type="button" class="update-dialog-text-button" @click="$emit('close')">
                稍后安装
              </button>
              <button type="button" class="update-dialog-primary-button" @click="$emit('install')">
                立即安装
              </button>
            </div>
            <p v-if="downloadError" class="update-dialog-link-error" role="alert">
              {{ downloadErrorMessage }}
            </p>
          </template>

          <template v-else>
            <header class="update-dialog-head">
              <span class="update-dialog-icon" aria-hidden="true">
                <svg fill="none" viewBox="0 0 24 24">
                  <path
                    d="M20.2 12A8.2 8.2 0 1 1 17.49 5.91"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <path d="m16.5 2.85 5.5 3.1-5.5 3.1V2.85Z" fill="currentColor"/>
                  <path
                    d="M12 7.7V12l3.1 1.85"
                    stroke="currentColor"
                    stroke-width="2.35"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>

              <div class="update-dialog-copy">
                <p class="update-dialog-kicker">{{ kicker }}</p>
                <h2 id="update-dialog-title">{{ title }}</h2>
                <p class="update-dialog-current">当前版本 v{{ currentVersion }} · 稳定通道</p>
              </div>

              <button
                ref="closeButtonRef"
                type="button"
                class="update-dialog-icon-button"
                title="关闭更新提示"
                aria-label="关闭更新提示"
                @click="$emit('close')"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/>
                </svg>
              </button>
            </header>

            <div v-if="status === 'loading'" class="update-dialog-state" role="status">
              <span class="update-dialog-spinner" aria-hidden="true"></span>
              <div>
                <b>正在连接 GitHub Releases</b>
                <p>读取稳定版本与安装包信息，请稍候。</p>
              </div>
            </div>

            <template v-else-if="status === 'available' && release">
              <div class="update-release-summary">
                <div class="update-release-heading">
                  <strong>本次更新</strong>
                  <span>{{ release.dateLabel }}</span>
                </div>
                <ul v-if="summaryItems.length" class="update-release-list">
                  <li v-for="item in summaryItems" :key="item">{{ item }}</li>
                </ul>
                <p v-else class="update-release-empty">该版本没有提供可展示的更新摘要。</p>
              </div>

              <div class="update-install-picker">
                <span class="update-install-label">选择安装类型</span>
                <button
                  type="button"
                  class="update-install-row"
                  :title="`下载 ${packageInfo.label}`"
                  @click="$emit('download')"
                >
                  <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 20h14v-2H5v2ZM19 9h-4V3H9v6H5l7 7 7-7Z"/>
                  </svg>
                  <span class="update-install-copy">
                    <b>{{ packageInfo.label }}</b>
                    <span>{{ packageInfo.note }}</span>
                  </span>
                  <svg class="update-install-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7"/>
                  </svg>
                </button>
              </div>

              <div class="update-dialog-actions">
                <span class="update-actions-spacer"></span>
                <button type="button" class="update-dialog-text-button" @click="$emit('close')">稍后提醒</button>
                <button type="button" class="update-dialog-text-button" @click="openDetails">查看详情</button>
                <button type="button" class="update-dialog-primary-button" @click="$emit('download')">
                  立即更新
                </button>
              </div>
            </template>

            <template v-else-if="status === 'latest'">
              <div class="update-dialog-state is-success">
                <span class="update-state-symbol" aria-hidden="true">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="m5.5 12.5 4.2 4.2L18.5 8"/>
                  </svg>
                </span>
                <div>
                  <b>已经是最新稳定版</b>
                  <p>当前安装的 HOMURA 与 GitHub 最新版本一致。</p>
                </div>
              </div>
              <div class="update-dialog-actions">
                <span class="update-actions-spacer"></span>
                <button type="button" class="update-dialog-text-button" @click="$emit('close')">关闭</button>
                <button type="button" class="update-dialog-primary-button" @click="$emit('changelog')">
                  查看更新日志
                </button>
              </div>
            </template>

            <template v-else-if="status === 'download-error'">
              <div class="update-dialog-state is-error" role="alert">
                <span class="update-state-symbol" aria-hidden="true">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8.5" stroke-width="1.8"/>
                    <path stroke-linecap="round" stroke-width="1.8" d="M12 7.8v4.8M12 16.3h.01"/>
                  </svg>
                </span>
                <div>
                  <b>下载没有完成</b>
                  <p>{{ errorMessage }}</p>
                </div>
              </div>
              <div class="update-dialog-actions">
                <span class="update-actions-spacer"></span>
                <button type="button" class="update-dialog-text-button" @click="$emit('close')">关闭</button>
                <button type="button" class="update-dialog-primary-button" @click="$emit('download')">
                  重新下载
                </button>
              </div>
            </template>

            <template v-else>
              <div class="update-dialog-state is-error" role="alert">
                <span class="update-state-symbol" aria-hidden="true">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8.5" stroke-width="1.8"/>
                    <path stroke-linecap="round" stroke-width="1.8" d="M12 7.8v4.8M12 16.3h.01"/>
                  </svg>
                </span>
                <div>
                  <b>暂时无法检查更新</b>
                  <p>{{ errorMessage }}</p>
                </div>
              </div>
              <div class="update-dialog-actions">
                <span class="update-actions-spacer"></span>
                <button type="button" class="update-dialog-text-button" @click="$emit('close')">关闭</button>
                <button type="button" class="update-dialog-primary-button" @click="$emit('retry')">再试一次</button>
              </div>
            </template>

            <p v-if="linkError" class="update-dialog-link-error" role="alert">{{ linkError }}</p>
          </template>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { openGitHubUrl } from '../services/external.js';
import { getUpdateErrorMessage } from '../services/updates.js';
import { getDownloadErrorMessage } from '../services/updateDownload.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  status: { type: String, default: 'idle' },
  release: { type: Object, default: null },
  currentVersion: { type: String, required: true },
  packageInfo: { type: Object, required: true },
  error: { type: Object, default: null },
  download: {
    type: Object,
    default: () => ({
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      fileName: '',
      path: '',
      size: 0,
      version: '',
      packageLabel: '',
      platform: ''
    })
  },
  downloadError: { type: Object, default: null }
});

const emit = defineEmits(['close', 'retry', 'changelog', 'download', 'cancel-download', 'install']);

const dialogRef = ref(null);
const closeButtonRef = ref(null);
const cancelDownloadButtonRef = ref(null);
const linkError = ref('');
let dialogTrigger = null;

const kicker = computed(() => {
  if (props.status === 'loading') return 'CHECKING RELEASES';
  if (props.status === 'available') return 'UPDATE AVAILABLE';
  if (props.status === 'latest') return 'YOU ARE UP TO DATE';
  return 'UPDATE CHECK FAILED';
});

const title = computed(() => {
  if (props.status === 'loading') return '正在检查更新';
  if (props.status === 'available' && props.release) return `发现新版本 ${props.release.version}`;
  if (props.status === 'latest') return '已是最新版本';
  if (props.status === 'download-error') return '下载未完成';
  return '检查更新失败';
});

const downloadErrorMessage = computed(() => getDownloadErrorMessage(props.downloadError));
const errorMessage = computed(() =>
  props.status === 'download-error'
    ? downloadErrorMessage.value
    : getUpdateErrorMessage(props.error)
);
const downloadPercent = computed(() => {
  const progress = Number(props.download && props.download.progress);
  return Math.min(100, Math.max(0, Number.isFinite(progress) ? progress * 100 : 0));
});
const downloadPercentLabel = computed(() => {
  if (downloadPercent.value >= 100) return '100%';
  return `${downloadPercent.value.toFixed(1)}%`;
});
const downloadPathParts = computed(() =>
  String(props.download.path || '').split(/([\\/])/).filter(Boolean)
);
const installWarning = computed(() => {
  const platform = props.download.platform || props.packageInfo.platform;
  if (platform === 'android' || platform === 'windows') {
    return '安装过程中应用将会退出';
  }
  if (platform === 'macos') {
    return '打开 DMG 后，将 HOMURA 拖入“应用程序”';
  }
  if (platform === 'linux') {
    return '将交由系统软件中心处理安装包';
  }
  return '将使用系统默认程序打开安装包';
});

const summaryItems = computed(() => {
  if (!props.release) return [];
  const items = props.release.notes.groups
    .flatMap(group => group.items)
    .slice(0, 4);
  if (items.length > 0) return items;
  return props.release.notes.intro ? [props.release.notes.intro] : [];
});

async function openExternal(url) {
  linkError.value = '';
  try {
    await openGitHubUrl(url);
  } catch (error) {
    linkError.value = '无法打开系统浏览器，请稍后再试。';
    console.warn('打开更新链接失败', error);
  }
}

function openDetails() {
  if (props.release) openExternal(props.release.htmlUrl);
}

function focusableButtons() {
  if (!dialogRef.value) return [];
  return Array.from(dialogRef.value.querySelectorAll('button:not(:disabled)'));
}

function onDialogKeydown(event) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (props.status === 'downloading') {
      cancelDownloadButtonRef.value?.click();
    } else if (closeButtonRef.value) {
      closeButtonRef.value.click();
    } else {
      emit('close');
    }
    return;
  }
  if (event.key !== 'Tab') return;

  const buttons = focusableButtons();
  if (buttons.length === 0) return;
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (open, previous) => {
    if (open) {
      linkError.value = '';
      dialogTrigger = document.activeElement;
      window.addEventListener('keydown', onDialogKeydown);
      await nextTick();
      if (props.status === 'downloading') {
        cancelDownloadButtonRef.value?.focus();
      } else {
        closeButtonRef.value?.focus();
        if (!closeButtonRef.value) dialogRef.value?.focus({ preventScroll: true });
      }
      return;
    }
    window.removeEventListener('keydown', onDialogKeydown);
    if (previous) {
      await nextTick();
      if (dialogTrigger && typeof dialogTrigger.focus === 'function') dialogTrigger.focus();
      dialogTrigger = null;
    }
  }
);

watch(
  () => props.status,
  async status => {
    if (!props.open) return;
    await nextTick();
    if (status === 'downloading') {
      cancelDownloadButtonRef.value?.focus();
    } else if (closeButtonRef.value) {
      closeButtonRef.value.focus();
    } else if (dialogRef.value) {
      dialogRef.value.focus({ preventScroll: true });
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDialogKeydown);
});
</script>

<style scoped>
.update-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 70;
  padding: 24px;
  display: grid;
  place-items: center;
  background: color-mix(in oklab, var(--md-shadow-color) 34%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.update-dialog-panel {
  width: min(520px, calc(100vw - 48px));
  max-height: min(760px, calc(100dvh - 48px));
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: 28px;
  background: var(--md-surface-container);
  color: var(--md-on-surface);
  box-shadow:
    0 30px 80px -28px color-mix(in oklab, var(--md-shadow-color) 58%, transparent),
    inset 0 0 0 0.5px color-mix(in oklab, var(--md-outline-variant) 72%, transparent);
}

.update-dialog-panel:focus {
  outline: none;
}

.update-dialog-panel.is-progress {
  width: min(420px, calc(100vw - 48px));
}

.update-dialog-panel.is-complete,
.update-dialog-panel.is-download-error {
  width: min(460px, calc(100vw - 48px));
}

.update-download-title {
  margin: 0;
  font-size: 25px;
  font-weight: 670;
  line-height: 1.25;
  letter-spacing: -0.03em;
}

.update-download-subtitle {
  margin: 8px 0 0;
  color: var(--md-on-surface-variant);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.55;
}

.update-download-progress {
  margin-top: 28px;
}

.update-download-track {
  position: relative;
  height: 5px;
  border-radius: 999px;
  background: var(--md-surface-high);
}

.update-download-track i {
  position: relative;
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--md-primary);
  transition: width 160ms var(--md-ease-emphasized);
}

.update-download-track i::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--md-primary);
  box-shadow: 0 0 0 3px var(--md-surface-container);
  transform: translateY(-50%);
}

.update-download-progress p {
  margin: 12px 0 0;
  color: var(--md-on-surface);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px;
  font-weight: 560;
  text-align: center;
}

.update-download-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
}

.update-download-complete-status {
  margin-top: 24px;
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.update-download-check {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--md-primary);
  color: var(--md-on-primary);
}

.update-download-check svg {
  width: 16px;
  height: 16px;
}

.update-download-complete-copy {
  min-width: 0;
}

.update-download-complete-copy b {
  display: block;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.5;
}

.update-download-complete-copy span {
  display: block;
  margin-top: 7px;
  color: color-mix(in oklab, var(--md-primary) 62%, var(--md-on-surface));
  font-size: 12px;
  font-weight: 620;
  line-height: 1.55;
}

.update-download-file {
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--md-surface-low);
  box-shadow: inset 0 0 0 0.5px color-mix(in oklab, var(--md-outline-variant) 78%, transparent);
}

.update-download-file span {
  display: block;
  margin-bottom: 6px;
  color: var(--md-on-surface-variant);
  font-size: 11px;
  font-weight: 600;
}

.update-download-file code {
  display: block;
  overflow-wrap: break-word;
  color: var(--md-on-surface);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.7;
}

.update-download-complete-actions {
  margin-top: 22px;
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.update-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.update-dialog-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}

.update-dialog-icon svg {
  width: 21px;
  height: 21px;
}

.update-dialog-copy {
  min-width: 0;
  flex: 1;
}

.update-dialog-kicker {
  margin: 0;
  color: var(--md-primary);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.update-dialog-copy h2 {
  margin: 5px 0 0;
  font-size: 22px;
  font-weight: 670;
  line-height: 1.25;
  letter-spacing: -0.025em;
}

.update-dialog-current {
  margin: 7px 0 0;
  color: var(--md-on-surface-variant);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
}

.update-dialog-icon-button {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--md-on-surface-variant);
  cursor: pointer;
  transition:
    background-color var(--md-duration-short) var(--md-ease-emphasized),
    color var(--md-duration-short) var(--md-ease-emphasized);
}

.update-dialog-icon-button:hover {
  background: var(--md-surface-high);
  color: var(--md-on-surface);
}

.update-dialog-icon-button svg {
  width: 18px;
  height: 18px;
}

.update-dialog-state {
  min-height: 132px;
  margin-top: 22px;
  padding: 20px;
  border-radius: 20px;
  background: var(--md-surface-low);
  box-shadow: inset 0 0 0 0.5px color-mix(in oklab, var(--md-outline-variant) 78%, transparent);
  display: flex;
  align-items: center;
  gap: 16px;
}

.update-dialog-state b {
  font-size: 13px;
  font-weight: 650;
}

.update-dialog-state p {
  margin: 7px 0 0;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 1.65;
}

.update-dialog-spinner {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border: 2.5px solid color-mix(in oklab, var(--md-primary) 18%, transparent);
  border-top-color: var(--md-primary);
  border-radius: 50%;
  animation: update-spin 800ms linear infinite;
}

.update-state-symbol {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}

.update-state-symbol svg {
  width: 21px;
  height: 21px;
}

.update-dialog-state.is-error .update-state-symbol {
  background: var(--md-error-container, var(--md-surface-high));
  color: var(--md-on-error-container, var(--md-on-surface));
}

.update-release-summary {
  margin-top: 22px;
  padding: 17px;
  border-radius: 18px;
  background: var(--md-surface-low);
  box-shadow: inset 0 0 0 0.5px color-mix(in oklab, var(--md-outline-variant) 78%, transparent);
}

.update-release-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}

.update-release-heading strong {
  font-size: 13px;
  font-weight: 650;
}

.update-release-heading span {
  color: var(--md-on-surface-variant);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
}

.update-release-list {
  margin: 13px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 9px;
}

.update-release-list li {
  position: relative;
  padding-left: 15px;
  font-size: 12px;
  line-height: 1.65;
}

.update-release-list li::before {
  content: "";
  position: absolute;
  top: 0.68em;
  left: 1px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--md-primary);
}

.update-release-empty {
  margin: 12px 0 0;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 1.65;
}

.update-install-picker {
  margin-top: 18px;
}

.update-install-label {
  display: block;
  margin-bottom: 8px;
  color: var(--md-on-surface-variant);
  font-size: 11px;
  font-weight: 600;
}

.update-install-row {
  width: 100%;
  min-height: 62px;
  padding: 10px 12px;
  border: 0.5px solid var(--md-outline-variant);
  border-radius: 16px;
  background: var(--md-surface);
  color: var(--md-on-surface);
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--md-duration-short) var(--md-ease-emphasized),
    border-color var(--md-duration-short) var(--md-ease-emphasized);
}

.update-install-row:hover {
  border-color: color-mix(in oklab, var(--md-primary) 46%, var(--md-outline-variant));
  background: var(--md-surface-container);
}

.update-install-row > svg:first-child {
  width: 19px;
  height: 19px;
  flex: 0 0 19px;
  color: var(--md-primary);
}

.update-install-copy {
  min-width: 0;
  flex: 1;
}

.update-install-copy b {
  display: block;
  font-size: 12px;
  font-weight: 640;
}

.update-install-copy span {
  display: block;
  margin-top: 3px;
  color: var(--md-on-surface-variant);
  font-size: 10.5px;
  word-break: break-word;
}

.update-install-chevron {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  color: var(--md-on-surface-variant);
}

.update-dialog-actions {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 0.5px solid var(--md-outline-variant);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.update-actions-spacer {
  margin-right: auto;
}

.update-dialog-text-button,
.update-dialog-primary-button {
  min-height: 40px;
  border: 0;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 640;
  cursor: pointer;
  transition:
    background-color var(--md-duration-short) var(--md-ease-emphasized),
    transform var(--md-duration-short) var(--md-ease-emphasized);
}

.update-dialog-text-button {
  padding: 0 12px;
  background: transparent;
  color: var(--md-primary);
}

.update-dialog-text-button:hover {
  background: var(--md-surface-high);
}

.update-dialog-primary-button {
  padding: 0 16px;
  background: var(--md-primary);
  color: var(--md-on-primary);
}

.update-dialog-primary-button:hover {
  background: color-mix(in oklab, var(--md-primary) 90%, var(--md-on-primary));
  transform: translateY(-1px);
}

.update-dialog-link-error {
  margin: 12px 0 0;
  color: var(--md-error, var(--md-primary));
  font-size: 11px;
  line-height: 1.55;
}

.update-dialog-enter-active,
.update-dialog-leave-active {
  transition: opacity var(--md-duration-short) var(--md-ease-emphasized);
}

.update-dialog-enter-active .update-dialog-panel,
.update-dialog-leave-active .update-dialog-panel {
  transition:
    opacity var(--md-duration-short) var(--md-ease-emphasized),
    transform var(--md-duration-short) var(--md-ease-emphasized);
}

.update-dialog-enter-from,
.update-dialog-leave-to {
  opacity: 0;
}

.update-dialog-enter-from .update-dialog-panel,
.update-dialog-leave-to .update-dialog-panel {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.update-dialog-enter-to,
.update-dialog-leave-from {
  opacity: 1;
}

@keyframes update-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 899px) {
  .update-dialog-layer {
    padding: 16px;
  }

  .update-dialog-panel {
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 20px;
    border-radius: 26px;
  }

  .update-dialog-head {
    gap: 11px;
  }

  .update-dialog-icon {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    border-radius: 13px;
  }

  .update-dialog-copy h2 {
    font-size: 21px;
  }

  .update-download-title {
    font-size: 23px;
  }

  .update-download-progress {
    margin-top: 25px;
  }

  .update-download-complete-status {
    margin-top: 21px;
  }

  .update-download-file {
    margin-top: 18px;
  }

  .update-download-complete-actions {
    margin-top: 18px;
  }

  .update-dialog-icon-button {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
    margin: -4px -6px 0 0;
  }

  .update-release-summary {
    margin-top: 18px;
    padding: 15px;
  }

  .update-release-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .update-install-picker {
    margin-top: 15px;
  }

  .update-dialog-actions {
    margin-top: 16px;
    padding-top: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .update-dialog-spinner {
    animation: none;
  }

  .update-dialog-icon-button,
  .update-install-row,
  .update-dialog-text-button,
  .update-dialog-primary-button,
  .update-download-track i,
  .update-dialog-enter-active,
  .update-dialog-leave-active,
  .update-dialog-enter-active .update-dialog-panel,
  .update-dialog-leave-active .update-dialog-panel {
    transition: none !important;
  }
}
</style>
