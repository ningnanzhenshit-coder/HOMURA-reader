/* ============================================================================
   HOMURA · Tauri 原生桥接
   ----------------------------------------------------------------------------
   所有 Rust / 原生插件命令统一从这里进入：能力探测、错误分类、特性级禁用，
   以及带 JS 回退的执行入口。调用方只在明确允许兜底时回退，避免把安全限制
   或数据损坏错误悄悄交给另一套解析器。
   ========================================================================== */

export const NativeErrorCode = Object.freeze({
  UNAVAILABLE: 'NATIVE_UNAVAILABLE',
  UNSUPPORTED: 'NATIVE_UNSUPPORTED',
  DISABLED: 'NATIVE_DISABLED',
  COMMAND_FAILED: 'NATIVE_COMMAND_FAILED',
  INVALID_DATA: 'NATIVE_INVALID_DATA',
  SECURITY_LIMIT: 'NATIVE_SECURITY_LIMIT',
  LIMIT_EXCEEDED: 'NATIVE_LIMIT_EXCEEDED',
  CANCELLED: 'NATIVE_CANCELLED'
});

const KNOWN_CODES = new Set(Object.values(NativeErrorCode));

const DEFAULT_FALLBACK_CODES = new Set([
  NativeErrorCode.UNAVAILABLE,
  NativeErrorCode.UNSUPPORTED,
  NativeErrorCode.DISABLED
]);

// 这两类错误必须由当前后端明确拒绝，不能回退到校验更弱的实现。
const NEVER_FALLBACK_CODES = new Set([
  NativeErrorCode.SECURITY_LIMIT,
  NativeErrorCode.LIMIT_EXCEEDED
]);

const disabledFeatures = new Map();

export class NativeBridgeError extends Error {
  constructor(code, message, options = {}) {
    super(message || '原生调用失败');
    this.name = 'NativeBridgeError';
    const normalizedCode = typeof code === 'string' ? code.toUpperCase() : '';
    this.code = KNOWN_CODES.has(normalizedCode) ? normalizedCode : NativeErrorCode.COMMAND_FAILED;
    this.feature = options.feature || null;
    this.plugin = options.plugin || null;
    this.command = options.command || null;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

function nativeCore() {
  return typeof window !== 'undefined' ? window.__TAURI__?.core : null;
}

function errorMessage(error) {
  if (typeof error === 'string') return error;
  if (error && typeof error.message === 'string' && error.message) return error.message;
  if (error === null || error === undefined) return '原生调用失败';
  return String(error);
}

function classifyMessage(message) {
  const text = String(message || '');
  if (!text) return NativeErrorCode.COMMAND_FAILED;

  // 原生插件在路径越界、压缩包炸弹或条目超限时通常只返回字符串，
  // 这里先把安全类错误识别出来，确保它们永远不会被 JS 回退掩盖。
  if (/SecurityException|路径不在|目录之外|路径穿越|path traversal|outside .*root|security/i.test(text)) {
    return NativeErrorCode.SECURITY_LIMIT;
  }
  if (/too (large|many)|exceeds?|limit|过大|过多|超出限制|超过上限/i.test(text)) {
    return NativeErrorCode.LIMIT_EXCEEDED;
  }
  if (/cancel(?:led|ed)|取消/i.test(text)) {
    return NativeErrorCode.CANCELLED;
  }
  if (
    /(unknown|not found|not registered|unavailable|is not available).*(command|plugin)/i.test(text)
    || /(?:command|plugin).*(unknown|not found|not registered|not available)/i.test(text)
    || /未注册|插件不可用|原生桥接不可用/i.test(text)
  ) {
    return NativeErrorCode.UNAVAILABLE;
  }
  if (/unsupported|not supported|暂不支持|不支持/i.test(text)) {
    return NativeErrorCode.UNSUPPORTED;
  }
  if (/invalid|corrupt|bad file|格式|损坏|无效|解析失败|parse/i.test(text)) {
    return NativeErrorCode.INVALID_DATA;
  }
  return NativeErrorCode.COMMAND_FAILED;
}

export function normalizeNativeError(error, context = {}) {
  if (error instanceof NativeBridgeError) {
    if (!error.feature && context.feature) error.feature = context.feature;
    if (!error.plugin && context.plugin) error.plugin = context.plugin;
    if (!error.command && context.command) error.command = context.command;
    return error;
  }

  const message = errorMessage(error);
  const explicit = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
  const code = KNOWN_CODES.has(explicit) ? explicit : classifyMessage(message);
  return new NativeBridgeError(code, message, { ...context, cause: error });
}

export function canUseNativeBridge() {
  const core = nativeCore();
  return !!core && typeof core.invoke === 'function';
}

export function bytesToBase64(input) {
  if (typeof btoa !== 'function') return null;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function isNativeFeatureAvailable(feature) {
  return canUseNativeBridge() && (!feature || !disabledFeatures.has(feature));
}

export function disableNativeFeature(feature, reason = '') {
  if (feature) disabledFeatures.set(feature, reason);
}

export function enableNativeFeature(feature) {
  disabledFeatures.delete(feature);
}

export function resetNativeRuntimeState() {
  disabledFeatures.clear();
}

function fallbackCodeSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  if (typeof value === 'string') return new Set([value]);
  return DEFAULT_FALLBACK_CODES;
}

export async function invokeNativeCommand(plugin, command, args = {}, options = {}) {
  if (!command) {
    throw new NativeBridgeError(
      NativeErrorCode.COMMAND_FAILED,
      '原生命令不能为空',
      { ...options, plugin, command }
    );
  }

  const feature = options.feature || null;
  if (feature && disabledFeatures.has(feature)) {
    throw new NativeBridgeError(
      NativeErrorCode.DISABLED,
      `原生能力 ${feature} 已在本次会话禁用`,
      { ...options, plugin, command }
    );
  }
  if (!canUseNativeBridge()) {
    throw new NativeBridgeError(
      NativeErrorCode.UNAVAILABLE,
      'Tauri 原生桥接不可用',
      { ...options, plugin, command }
    );
  }

  const fullCommand = plugin ? `plugin:${plugin}|${command}` : command;
  try {
    return await window.__TAURI__.core.invoke(fullCommand, args);
  } catch (error) {
    throw normalizeNativeError(error, {
      ...options,
      plugin,
      command: fullCommand
    });
  }
}

// 原生能力的统一兜底入口。默认只对“不可用 / 不支持 / 已禁用”回退；
// 调用方可以通过 fallbackOn 或 shouldFallback 明确扩大范围，但安全与超限错误
// 永远由当前后端抛出，不会触发回退。
export async function runNativeWithFallback({
  feature = 'default',
  plugin = null,
  command,
  args = {},
  fallback,
  fallbackOn = DEFAULT_FALLBACK_CODES,
  shouldFallback = null,
  logger = console
} = {}) {
  if (typeof fallback !== 'function') {
    throw new TypeError('runNativeWithFallback 需要 fallback 函数');
  }

  const runFallback = (error, shouldLog = true) => {
    if (shouldLog && error && logger?.warn) {
      logger.warn(`[HOMURA] 原生能力 ${feature} 回退 JS`, error);
    }
    return fallback(error);
  };

  if (!canUseNativeBridge()) {
    return runFallback(new NativeBridgeError(
      NativeErrorCode.UNAVAILABLE,
      'Tauri 原生桥接不可用',
      { feature, plugin, command }
    ), false);
  }
  if (disabledFeatures.has(feature)) {
    return runFallback(new NativeBridgeError(
      NativeErrorCode.DISABLED,
      `原生能力 ${feature} 已在本次会话禁用`,
      { feature, plugin, command }
    ), false);
  }

  try {
    return await invokeNativeCommand(plugin, command, args, { feature });
  } catch (rawError) {
    const error = normalizeNativeError(rawError, { feature, plugin, command });
    const allowed = !NEVER_FALLBACK_CODES.has(error.code)
      && (typeof shouldFallback === 'function'
        ? shouldFallback(error)
        : fallbackCodeSet(fallbackOn).has(error.code));
    if (!allowed) throw error;
    return runFallback(error);
  }
}
