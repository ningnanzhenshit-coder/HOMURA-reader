/* ============================================================================
   HOMURA · 书架封面缩略图
   ----------------------------------------------------------------------------
   书架卡片最大只显示到 220px 左右，直接解码整张原图会让安卓 WebView
   为几十本书各占一份大位图。这里把封面缩到最长边 480px 再落盘。
   Tauri 环境优先交给 Rust 的 image 解码与缩放；浏览器或原生不支持该格式时，
   回退到原来的 Canvas / OffscreenCanvas 实现。
   ========================================================================== */

import {
  NativeErrorCode,
  bytesToBase64,
  canUseNativeBridge,
  disableNativeFeature,
  invokeNativeCommand
} from './nativeRuntime.js';

const COVER_MAX_EDGE = 480;
const WEBP_QUALITY = 0.84;
const FEATURE = 'cover-thumb';
const MAX_NATIVE_COVER_BYTES = 20 * 1024 * 1024;

function encodeCanvas(canvas) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
  }
  return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
}

function base64ToBlob(value, mime) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime || 'image/webp' });
}

async function createWithNative(blob, maxEdge) {
  if (!canUseNativeBridge() || blob.size > MAX_NATIVE_COVER_BYTES) return null;
  try {
    const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    if (!base64) return null;
    const result = await invokeNativeCommand(
      null,
      'create_cover_thumbnail',
      { bytesBase64: base64, maxEdge },
      { feature: FEATURE }
    );
    if (!result || typeof result !== 'object') return null;
    if (!result.changed) return blob;
    if (typeof result.bytesBase64 !== 'string' || !result.bytesBase64) return null;
    return base64ToBlob(result.bytesBase64, result.mime);
  } catch (err) {
    if ([NativeErrorCode.UNAVAILABLE, NativeErrorCode.DISABLED].includes(err?.code)) {
      disableNativeFeature(FEATURE, err.message);
    }
    // 安全上限不能交给 JS 再试一次；普通格式不支持或解码失败则继续 Canvas 兜底。
    if ([NativeErrorCode.SECURITY_LIMIT, NativeErrorCode.LIMIT_EXCEEDED].includes(err?.code)) throw err;
    return null;
  }
}

// 返回 null 表示当前环境无法处理；返回原 Blob 表示无需缩小。
export async function createCoverThumbnailWithCanvas(blob, maxEdge = COVER_MAX_EDGE) {
  // JSZip 解出的图片 Blob 常常没有 MIME type，交给 createImageBitmap 按内容判断。
  if (!blob || typeof blob.size !== 'number' || (blob.type && !String(blob.type).startsWith('image/'))) return null;
  if (typeof createImageBitmap !== 'function') return null;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
    const width = bitmap.width || 0;
    const height = bitmap.height || 0;
    if (!width || !height) return null;

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    if (scale >= 1) return blob;

    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(targetWidth, targetHeight);
    } else {
      canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const thumbnail = await encodeCanvas(canvas);
    if (!thumbnail || thumbnail.size >= blob.size * 0.92) return blob;
    return thumbnail;
  } catch (err) {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

export async function createCoverThumbnail(blob, maxEdge = COVER_MAX_EDGE) {
  if (!blob || typeof blob.size !== 'number' || (blob.type && !String(blob.type).startsWith('image/'))) return null;
  let native = null;
  try {
    native = await createWithNative(blob, maxEdge);
  } catch (err) {
    return null;
  }
  if (native) return native;
  return createCoverThumbnailWithCanvas(blob, maxEdge);
}
