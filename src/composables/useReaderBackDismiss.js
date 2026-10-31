/* ============================================================================
   HOMURA · 阅读器预见式返回
   ----------------------------------------------------------------------------
   左边缘右滑时直接写 CSS 变量驱动阅读器、书架与遮罩，避免每帧触发 Vue
   响应式重渲染。松手后按位移 / 速度决定完成返回或回弹。
   ========================================================================== */

import { nextTick, onBeforeUnmount, watch } from 'vue';

const COMMIT_RATIO = 0.28;
const FLING_VELOCITY = 0.52;
const MIN_FLING_DISTANCE = 24;
const SETTLE_DURATION = 300;
const READER_SCALE_DELTA = 0.055;
const READER_RADIUS = 26;
const LIBRARY_MAX_OFFSET = 28;
const SCRIM_OPACITY = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function useReaderBackDismiss(reader, ui) {
  let gesture = null;
  let settling = false;
  let settleToken = 0;
  let frameId = 0;
  let pendingProgress = 0;

  function applyProgress(progress) {
    const width = window.innerWidth || 375;
    const p = clamp(progress, 0, 1);
    const rootStyle = document.documentElement.style;

    rootStyle.setProperty('--homura-back-reader-x', `${p * width}px`);
    rootStyle.setProperty('--homura-back-reader-scale', `${1 - READER_SCALE_DELTA * p}`);
    rootStyle.setProperty('--homura-back-reader-radius', `${READER_RADIUS * p}px`);
    rootStyle.setProperty(
      '--homura-back-library-x',
      `${-Math.min(LIBRARY_MAX_OFFSET, width * 0.06) * (1 - p)}px`
    );
    rootStyle.setProperty('--homura-back-scrim-opacity', `${SCRIM_OPACITY * (1 - p)}`);
  }

  function queueProgress(progress) {
    pendingProgress = progress;
    if (frameId) return;
    frameId = requestAnimationFrame(() => {
      frameId = 0;
      applyProgress(pendingProgress);
    });
  }

  function resetVisuals() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    pendingProgress = 0;
    document.documentElement.classList.remove('reader-back-settling');
    document.documentElement.classList.remove('reader-back-entering');
    applyProgress(0);
  }

  function playEnter() {
    if (!reader.currentBook) return;
    const token = ++settleToken;
    const reduceMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      resetVisuals();
      settling = false;
      return;
    }

    settling = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    resetVisuals();
    document.documentElement.classList.add('reader-back-entering');

    window.setTimeout(() => {
      if (token !== settleToken) return;
      document.documentElement.classList.remove('reader-back-entering');
      settling = false;
    }, SETTLE_DURATION);
  }

  function releasePointer(e) {
    if (e.currentTarget && e.currentTarget.releasePointerCapture) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  }

  function clearGesture(e) {
    if (e) releasePointer(e);
    gesture = null;
  }

  function settle(commit) {
    if (settling) return;
    settling = true;
    const token = ++settleToken;
    const reduceMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      resetVisuals();
      if (commit) reader.closeReader();
      settling = false;
      return;
    }

    cancelAnimationFrame(frameId);
    frameId = 0;
    document.documentElement.classList.remove('reader-back-entering');
    document.documentElement.classList.add('reader-back-settling');
    applyProgress(commit ? 1 : 0);

    window.setTimeout(async () => {
      if (token !== settleToken) return;
      if (commit) {
        reader.closeReader();
        await nextTick();
      }
      if (token !== settleToken) return;
      resetVisuals();
      settling = false;
    }, SETTLE_DURATION);
  }

  function onPointerDown(e) {
    if (settling || !reader.currentBook || ui.settingsOpen || ui.tocOpen) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    gesture = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      lastX: e.clientX,
      lastTime: performance.now(),
      axis: null,
      active: false
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;

    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!gesture.axis && (absX > 6 || absY > 6)) {
      if (dx > 0 && absX > absY * 1.15) {
        gesture.axis = 'x';
        gesture.active = true;
      } else if (absY > absX) {
        // 纵向滑动交还给条漫原生滚动
        clearGesture(e);
        return;
      }
    }
    if (gesture.axis !== 'x') return;

    e.preventDefault();
    e.stopPropagation();
    gesture.lastX = e.clientX;
    gesture.lastTime = performance.now();
    queueProgress(dx / (window.innerWidth || 375));
  }

  function finishGesture(e, cancelled = false) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const current = gesture;
    clearGesture(e);

    if (!current.active) return;
    const dx = current.lastX - current.startX;
    const elapsed = Math.max(1, current.lastTime - current.startTime);
    const velocity = dx / elapsed;
    const progress = dx / (window.innerWidth || 375);
    const commit = !cancelled && (
      progress >= COMMIT_RATIO
      || (velocity >= FLING_VELOCITY && dx >= MIN_FLING_DISTANCE)
    );

    e.preventDefault();
    e.stopPropagation();
    settle(commit);
  }

  function onPointerUp(e) {
    finishGesture(e);
  }

  function onPointerCancel(e) {
    finishGesture(e, true);
  }

  function onPointerLostCapture(e) {
    if (gesture && e.pointerId === gesture.pointerId) finishGesture(e, true);
  }

  function dismissWithPredictiveBack() {
    if (!reader.currentBook || settling) return;
    settle(true);
  }

  watch(
    () => reader.currentBook,
    (book, previousBook) => {
      settleToken++;
      gesture = null;
      settling = false;
      if (book && !previousBook) playEnter();
      else resetVisuals();
    }
  );

  onBeforeUnmount(() => {
    settleToken++;
    cancelAnimationFrame(frameId);
    document.documentElement.classList.remove('reader-back-settling');
    document.documentElement.classList.remove('reader-back-entering');
  });

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLostCapture,
    dismissWithPredictiveBack
  };
}
