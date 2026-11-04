<template>
  <Teleport to="body">
    <Transition name="changelog-sheet">
      <div
        v-if="open"
        class="changelog-layer"
        :class="{ 'is-compact': compact }"
        @mousedown.self="$emit('close')"
      >
        <aside
          ref="sheetRef"
          class="changelog-panel"
          :class="{ 'is-compact': compact }"
          role="dialog"
          aria-modal="true"
          aria-labelledby="changelog-title"
          :aria-busy="status === 'loading'"
        >
          <div
            v-if="compact"
            class="changelog-drag-zone"
            @pointerdown="onDragStart"
            @pointermove="onDragMove"
            @pointerup="onDragEnd"
            @pointercancel="onDragCancel"
          >
            <i aria-hidden="true"></i>
          </div>

          <header class="changelog-head">
            <div class="changelog-head-copy">
              <p class="changelog-kicker">RELEASE NOTES</p>
              <h2 id="changelog-title">更新日志</h2>
              <p>查看 HOMURA 每个稳定版本带来的变化。</p>
            </div>
            <button
              ref="closeButtonRef"
              type="button"
              class="changelog-icon-button"
              title="关闭更新日志"
              aria-label="关闭更新日志"
              @click="$emit('close')"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </header>

          <div class="changelog-scroll">
            <div v-if="status === 'loading'" class="changelog-state" role="status">
              <template v-for="index in 3" :key="index">
                <span class="changelog-skeleton is-version"></span>
                <span class="changelog-skeleton is-copy"></span>
                <span class="changelog-skeleton is-copy-short"></span>
              </template>
            </div>

            <div v-else-if="status === 'error'" class="changelog-state is-error" role="alert">
              <span class="changelog-error-icon" aria-hidden="true">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8.5" stroke-width="1.8"/>
                  <path stroke-linecap="round" stroke-width="1.8" d="M12 7.8v4.8M12 16.3h.01"/>
                </svg>
              </span>
              <b>暂时无法读取更新日志</b>
              <p>{{ errorMessage }}</p>
              <button type="button" class="changelog-retry-button" @click="$emit('retry')">重试</button>
            </div>

            <template v-else-if="releases.length">
              <article
                v-for="(release, index) in releases"
                :key="release.id || release.version"
                class="changelog-entry"
                :class="{ 'is-current': isCurrent(release) }"
              >
                <div class="changelog-version-row">
                  <strong>{{ release.tag }}</strong>
                  <span v-if="index === 0" class="changelog-badge">最新</span>
                  <span v-if="isCurrent(release)" class="changelog-badge is-current">当前版本</span>
                  <span class="changelog-date">{{ release.dateLabel }}</span>
                </div>
                <p v-if="releaseSummary(release)" class="changelog-summary">{{ releaseSummary(release) }}</p>
                <div v-if="release.notes.groups.length" class="changelog-groups">
                  <div v-for="group in release.notes.groups" :key="group.title" class="changelog-group">
                    <b>{{ group.title }}</b>
                    <ul>
                      <li v-for="item in group.items" :key="item">{{ item }}</li>
                    </ul>
                  </div>
                </div>
                <p v-else class="changelog-empty">该版本没有提供可展示的更新说明。</p>
              </article>
            </template>

            <div v-else class="changelog-state">
              <b>还没有版本记录</b>
              <p>GitHub Releases 中暂时没有可展示的稳定版本。</p>
            </div>
          </div>

          <footer class="changelog-foot">
            <button type="button" @click="openReleasesPage">
              在 GitHub 查看全部发布
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 17 17 7M9 7h8v8"/>
              </svg>
            </button>
            <p v-if="linkError" role="alert">{{ linkError }}</p>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useSheetDrag } from '../composables/useSheetDrag.js';
import { openGitHubUrl } from '../services/external.js';
import {
  getUpdateErrorMessage,
  RELEASES_PAGE_URL
} from '../services/updates.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  status: { type: String, default: 'idle' },
  releases: { type: Array, default: () => [] },
  currentVersion: { type: String, required: true },
  error: { type: Object, default: null }
});

const emit = defineEmits(['close', 'retry']);

const closeButtonRef = ref(null);
const linkError = ref('');
let sheetTrigger = null;

const openModel = computed(() => props.open);
const compactModel = computed(() => props.compact);
const errorMessage = computed(() => getUpdateErrorMessage(props.error));
const {
  sheetRef,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel
} = useSheetDrag({
  isCompact: compactModel,
  isOpen: openModel,
  onClose: () => emit('close')
});

function isCurrent(release) {
  return release.version === props.currentVersion.replace(/^v/i, '');
}

function releaseSummary(release) {
  if (release.notes.intro) return release.notes.intro;
  if (release.notes.itemCount > 0) return `${release.notes.itemCount} 项更新`;
  return '';
}

async function openReleasesPage() {
  linkError.value = '';
  try {
    await openGitHubUrl(RELEASES_PAGE_URL);
  } catch (error) {
    linkError.value = '无法打开系统浏览器，请稍后再试。';
    console.warn('打开 Releases 页面失败', error);
  }
}

function focusableElements() {
  if (!sheetRef.value) return [];
  return Array.from(
    sheetRef.value.querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')
  );
}

function onPanelKeydown(event) {
  if (!props.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeButtonRef.value?.click();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = focusableElements();
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

watch(
  () => props.open,
  async (open, previous) => {
    if (open) {
      linkError.value = '';
      sheetTrigger = document.activeElement;
      window.addEventListener('keydown', onPanelKeydown);
      await nextTick();
      closeButtonRef.value?.focus();
      return;
    }
    window.removeEventListener('keydown', onPanelKeydown);
    if (previous) {
      await nextTick();
      if (sheetTrigger && typeof sheetTrigger.focus === 'function') sheetTrigger.focus();
      sheetTrigger = null;
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onPanelKeydown);
});
</script>

<style scoped>
.changelog-layer {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in oklab, var(--md-shadow-color) 34%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

@media (max-width: 899px) {
  .changelog-layer {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

.changelog-panel {
  width: min(372px, calc(100% - 24px));
  height: 100%;
  overflow: hidden;
  background: var(--md-surface-container);
  color: var(--md-on-surface);
  display: flex;
  flex-direction: column;
  box-shadow: -24px 0 70px -34px color-mix(in oklab, var(--md-shadow-color) 52%, transparent);
}

.changelog-drag-zone {
  height: 26px;
  flex: 0 0 26px;
  display: none;
  align-items: center;
  justify-content: center;
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.changelog-drag-zone:active {
  cursor: grabbing;
}

.changelog-drag-zone i {
  width: 32px;
  height: 4px;
  border-radius: 999px;
  background: var(--md-outline-variant);
}

.changelog-head {
  padding: 24px 22px 17px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.changelog-head-copy {
  flex: 1;
  min-width: 0;
}

.changelog-kicker {
  margin: 0;
  color: var(--md-primary);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.changelog-head h2 {
  margin: 6px 0 0;
  font-size: 21px;
  font-weight: 670;
  letter-spacing: -0.025em;
}

.changelog-head p:last-child {
  margin: 7px 0 0;
  color: var(--md-on-surface-variant);
  font-size: 11px;
  line-height: 1.6;
}

.changelog-icon-button {
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

.changelog-icon-button:hover {
  background: var(--md-surface-high);
  color: var(--md-on-surface);
}

.changelog-icon-button svg {
  width: 18px;
  height: 18px;
}

.changelog-scroll {
  flex: 1;
  padding: 0 22px 26px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.changelog-entry {
  position: relative;
  padding: 19px 0 20px 19px;
  border-top: 0.5px solid var(--md-outline-variant);
}

.changelog-entry::before {
  content: "";
  position: absolute;
  top: 26px;
  left: 1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--md-outline);
  box-shadow: 0 0 0 4px var(--md-surface-container);
}

.changelog-entry::after {
  content: "";
  position: absolute;
  top: 37px;
  bottom: -12px;
  left: 4px;
  width: 0.5px;
  background: var(--md-outline-variant);
}

.changelog-entry:last-child::after {
  display: none;
}

.changelog-entry.is-current::before {
  background: var(--md-primary);
}

.changelog-version-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.changelog-version-row strong {
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px;
  font-weight: 700;
}

.changelog-badge {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
  font-size: 9.5px;
  font-weight: 650;
}

.changelog-badge.is-current {
  background: var(--md-surface-high);
  color: var(--md-on-surface-variant);
}

.changelog-date {
  margin-left: auto;
  color: var(--md-on-surface-variant);
  font-family: var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9.5px;
}

.changelog-summary {
  margin: 9px 0 0;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 1.7;
}

.changelog-groups {
  margin-top: 11px;
  display: grid;
  gap: 10px;
}

.changelog-group {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  font-size: 11px;
  line-height: 1.65;
}

.changelog-group b {
  color: var(--md-primary);
  font-weight: 650;
}

.changelog-group ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
  color: var(--md-on-surface-variant);
}

.changelog-group li {
  position: relative;
  padding-left: 10px;
}

.changelog-group li::before {
  content: "";
  position: absolute;
  top: 0.7em;
  left: 0;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.58;
}

.changelog-empty {
  margin: 9px 0 0;
  color: var(--md-on-surface-variant);
  font-size: 11px;
  line-height: 1.65;
}

.changelog-state {
  min-height: 220px;
  padding: 30px 6px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
}

.changelog-state b {
  font-size: 13px;
  font-weight: 650;
}

.changelog-state p {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 1.65;
}

.changelog-state.is-error {
  align-items: flex-start;
}

.changelog-error-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--md-surface-high);
  color: var(--md-on-surface-variant);
}

.changelog-error-icon svg {
  width: 21px;
  height: 21px;
}

.changelog-retry-button {
  min-height: 40px;
  margin-top: 8px;
  padding: 0 16px;
  border: 0;
  border-radius: 20px;
  background: var(--md-primary);
  color: var(--md-on-primary);
  font-size: 12px;
  font-weight: 640;
  cursor: pointer;
}

.changelog-skeleton {
  display: block;
  border-radius: 999px;
  background: var(--md-surface-high);
  animation: changelog-pulse 1.2s ease-in-out infinite alternate;
}

.changelog-skeleton.is-version {
  width: 74px;
  height: 16px;
  margin-top: 7px;
}

.changelog-skeleton.is-copy {
  width: 92%;
  height: 10px;
  margin-top: 9px;
}

.changelog-skeleton.is-copy-short {
  width: 68%;
  height: 10px;
  margin-bottom: 18px;
}

.changelog-foot {
  padding: 14px 22px calc(16px + env(safe-area-inset-bottom));
  border-top: 0.5px solid var(--md-outline-variant);
  background: var(--md-surface-container);
}

.changelog-foot button {
  width: 100%;
  min-height: 42px;
  border: 0;
  border-radius: 21px;
  background: var(--md-surface-high);
  color: var(--md-on-surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
}

.changelog-foot button:hover {
  background: var(--md-surface-highest);
}

.changelog-foot svg {
  width: 15px;
  height: 15px;
}

.changelog-foot p {
  margin: 8px 4px 0;
  color: var(--md-primary);
  font-size: 10.5px;
  text-align: center;
}

.changelog-sheet-enter-active,
.changelog-sheet-leave-active {
  transition: opacity var(--md-duration-short) var(--md-ease-emphasized);
}

.changelog-sheet-enter-active .changelog-panel,
.changelog-sheet-leave-active .changelog-panel {
  transition: transform var(--md-duration-short) var(--md-ease-emphasized);
}

.changelog-sheet-enter-from,
.changelog-sheet-leave-to {
  opacity: 0;
}

.changelog-sheet-enter-from .changelog-panel,
.changelog-sheet-leave-to .changelog-panel {
  transform: translateX(100%);
}

@keyframes changelog-pulse {
  from { opacity: 0.48; }
  to { opacity: 1; }
}

@media (max-width: 899px) {
  .changelog-layer.is-compact {
    align-items: flex-end;
  }

  .changelog-panel.is-compact {
    width: 100%;
    height: auto;
    max-height: 78dvh;
    border-radius: 28px 28px 0 0;
    box-shadow: 0 -24px 70px -34px color-mix(in oklab, var(--md-shadow-color) 52%, transparent);
  }

  .changelog-panel.is-compact .changelog-drag-zone {
    display: flex;
  }

  .changelog-panel.is-compact .changelog-head {
    padding: 12px 20px 15px;
  }

  .changelog-panel.is-compact .changelog-icon-button {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
    margin: -3px -5px 0 0;
  }

  .changelog-panel.is-compact .changelog-scroll {
    padding: 0 20px 22px;
  }

  .changelog-panel.is-compact .changelog-foot {
    padding: 12px 20px calc(14px + env(safe-area-inset-bottom));
  }

  .changelog-sheet-enter-from .changelog-panel.is-compact,
  .changelog-sheet-leave-to .changelog-panel.is-compact {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .changelog-icon-button,
  .changelog-sheet-enter-active,
  .changelog-sheet-leave-active,
  .changelog-sheet-enter-active .changelog-panel,
  .changelog-sheet-leave-active .changelog-panel {
    transition: none !important;
  }

  .changelog-skeleton {
    animation: none;
  }
}
</style>
