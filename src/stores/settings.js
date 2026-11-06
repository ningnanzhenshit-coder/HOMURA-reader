/* ============================================================================
   HOMURA · 应用设置 Store
   ----------------------------------------------------------------------------
   保存全局外观之外的用户偏好。阅读默认值只影响尚未留下排版记录的作品，
   已读作品继续使用各自的排版记忆；调试开关用于覆盖平台相关的界面能力。
   ========================================================================== */

import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import { isWindows } from '../services/platform.js';
import { READING_DIRECTIONS } from '../services/collectionReading.js';

const READER_DEFAULTS_KEY = 'homura_reader_defaults';
const DEBUG_FORCE_FULLSCREEN_KEY = 'homura_debug_force_fullscreen';

export const DEFAULT_READER_SETTINGS = Object.freeze({
  direction: 'ltr',
  spread: 2,
  coverOffset: true,
  fontSize: 18
});

function normalizeReaderDefaults(value) {
  const source = value && typeof value === 'object' ? value : {};
  const rawFontSize = Number(source.fontSize);
  const fontSize = Number.isFinite(rawFontSize)
    ? Math.min(28, Math.max(14, Math.round(rawFontSize / 2) * 2))
    : DEFAULT_READER_SETTINGS.fontSize;

  return {
    direction: READING_DIRECTIONS.includes(source.direction)
      ? source.direction
      : DEFAULT_READER_SETTINGS.direction,
    spread: source.spread === 1 ? 1 : 2,
    coverOffset: typeof source.coverOffset === 'boolean'
      ? source.coverOffset
      : DEFAULT_READER_SETTINGS.coverOffset,
    fontSize
  };
}

function readReaderDefaults() {
  try {
    const raw = localStorage.getItem(READER_DEFAULTS_KEY);
    return raw ? normalizeReaderDefaults(JSON.parse(raw)) : { ...DEFAULT_READER_SETTINGS };
  } catch (err) {
    return { ...DEFAULT_READER_SETTINGS };
  }
}

function writeReaderDefaults(value) {
  try {
    localStorage.setItem(READER_DEFAULTS_KEY, JSON.stringify(value));
  } catch (err) {
    console.warn('[HOMURA] 阅读默认值保存失败', err);
  }
}

function readDebugForceFullscreen() {
  try {
    return localStorage.getItem(DEBUG_FORCE_FULLSCREEN_KEY) === '1';
  } catch (err) {
    return false;
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const readerDefaults = reactive(readReaderDefaults());
  const debugForceFullscreen = ref(readDebugForceFullscreen());
  const showFullscreenButton = computed(() => isWindows || debugForceFullscreen.value);

  function persistReaderDefaults() {
    writeReaderDefaults(readerDefaults);
  }

  function setReaderDefault(key, value) {
    const next = normalizeReaderDefaults({ ...readerDefaults, [key]: value });
    Object.assign(readerDefaults, next);
    persistReaderDefaults();
  }

  function resetReaderDefaults() {
    Object.assign(readerDefaults, DEFAULT_READER_SETTINGS);
    persistReaderDefaults();
  }

  function setDebugForceFullscreen(value) {
    const next = !!value;
    debugForceFullscreen.value = next;
    try {
      localStorage.setItem(DEBUG_FORCE_FULLSCREEN_KEY, next ? '1' : '0');
    } catch (err) {
      console.warn('[HOMURA] 调试开关保存失败', err);
    }
  }

  return {
    readerDefaults,
    debugForceFullscreen,
    showFullscreenButton,
    setReaderDefault,
    resetReaderDefaults,
    setDebugForceFullscreen
  };
});
