/* ============================================================================
   HOMURA · TXT 编码兼容
   ----------------------------------------------------------------------------
   先识别 BOM 与 UTF-16 零字节特征，再严格验证 UTF-8；旧中文 ANSI 文本
   使用 GB18030 解码，覆盖 GBK / GB2312，无需修改或转存原文件。
   ========================================================================== */

import {
  NativeErrorCode,
  bytesToBase64,
  canUseNativeBridge,
  runNativeWithFallback
} from './nativeRuntime.js';

// TXT 通常远小于这个值；大文件继续交给 JS，避免 base64 和 IPC 先吃掉内存。
export const NATIVE_TEXT_MAX_BYTES = 8 * 1024 * 1024;

const TEXT_FALLBACK_CODES = [
  NativeErrorCode.UNAVAILABLE,
  NativeErrorCode.UNSUPPORTED,
  NativeErrorCode.DISABLED,
  NativeErrorCode.COMMAND_FAILED,
  NativeErrorCode.INVALID_DATA
];

function guessUtf16(bytes) {
  const pairs = Math.floor(Math.min(bytes.length, 65536) / 2);
  if (!pairs) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < pairs * 2; i += 2) {
    if (bytes[i] === 0) evenZeros++;
    if (bytes[i + 1] === 0) oddZeros++;
  }
  const minimum = Math.max(1, Math.ceil(pairs * 0.15));
  if (oddZeros >= minimum && oddZeros > evenZeros * 3) return 'utf-16le';
  if (evenZeros >= minimum && evenZeros > oddZeros * 3) return 'utf-16be';
  return null;
}

export function decodeTxtBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  // 无 BOM 的 UTF-16 英文也是合法 UTF-8 字节，必须先检查交错的零字节。
  const utf16 = guessUtf16(bytes);
  if (utf16) return new TextDecoder(utf16).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    return new TextDecoder('gb18030').decode(bytes);
  }
}

function textFromNativeResult(result) {
  if (result && typeof result.text === 'string') return result.text;
  return null;
}

// Tauri 环境优先让 Rust 识别编码；没有桥接、文件过大或原生失败时继续使用
// 同步的浏览器解码路径。返回值始终是字符串，调用方不感知后端差异。
export async function decodeTxtBytesAsync(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length === 0 || bytes.length > NATIVE_TEXT_MAX_BYTES || !canUseNativeBridge()) {
    return decodeTxtBytes(bytes);
  }

  const payload = bytesToBase64(bytes);
  if (payload === null) return decodeTxtBytes(bytes);

  const result = await runNativeWithFallback({
    feature: 'text',
    command: 'decode_text_bytes',
    args: { bytesBase64: payload },
    fallback: () => decodeTxtBytes(bytes),
    fallbackOn: TEXT_FALLBACK_CODES
  });
  return textFromNativeResult(result) ?? decodeTxtBytes(bytes);
}
