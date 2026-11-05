/* ============================================================================
   HOMURA · 书架封面缩略图
   ----------------------------------------------------------------------------
   书架卡片最大只显示到 220px 左右，直接解码整张原图会让安卓 WebView
   为几十本书各占一份大位图。这里把封面缩到最长边 480px 再落盘。
   ========================================================================== */

const COVER_MAX_EDGE = 480;
const WEBP_QUALITY = 0.84;

function encodeCanvas(canvas) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
  }
  return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
}

// 返回 null 表示当前环境无法处理；返回原 Blob 表示无需缩小。
export async function createCoverThumbnail(blob, maxEdge = COVER_MAX_EDGE) {
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
