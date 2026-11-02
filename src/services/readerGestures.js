/* ============================================================================
   HOMURA · 鼠标 / 触屏统一点击与滑动判定
   ========================================================================== */

export const TAP_MAX_DURATION = 300;
export const TAP_MAX_DISTANCE = 8;

export function readerTapZone(x, width) {
  const ratio = x / Math.max(1, width);
  return ratio < 0.3 ? 'left' : ratio >= 0.7 ? 'right' : 'center';
}

export function classifyReaderGesture({ dx, dy, duration, maxDistance, width, x }) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const distance = Math.max(maxDistance || 0, absX, absY);
  if (distance < TAP_MAX_DISTANCE && duration < TAP_MAX_DURATION) {
    return { type: 'tap', zone: readerTapZone(x, width) };
  }
  const horizontal = absX > 24 && absX > absY * 1.2;
  const threshold = Math.max(48, width * 0.14);
  if (horizontal && (absX > threshold || (absX / Math.max(1, duration) > 0.45 && absX > 24))) {
    return { type: 'swipe', zone: dx > 0 ? 'left' : 'right' };
  }
  return { type: 'cancel', zone: null };
}
