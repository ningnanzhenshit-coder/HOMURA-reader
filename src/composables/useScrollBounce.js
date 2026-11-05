/* ============================================================================
   HOMURA · 书架滚动回弹
   ----------------------------------------------------------------------------
   手机书架在内部滚动容器里、桌面在窗口里滚动。到达顶部或底部后继续拖动
   （触摸 / 滚轮），只位移书架内容并施加阻力；松手后沿弹簧曲线归位。
   这里直接写 DOM transform，不回灌响应式状态，避免滚动期间触发重渲染。
   ========================================================================== */

import { onBeforeUnmount, watch } from 'vue';

const MAX_PULL = 48;
const RESISTANCE = 0.55;
const MAX_RAW_PULL = 180;
const MAX_WHEEL_STEP = 64;
const SETTLE_MS = 200;
const WHEEL_SETTLE_MS = 90;
const CLICK_GUARD_MS = 420;
const IGNORE_TARGET = 'input, textarea, select, [contenteditable], [data-no-scroll-bounce]';

function prefersReducedMotion() {
  return !!(typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function rubberBand(distance) {
  if (!distance) return 0;
  const magnitude = Math.abs(distance);
  const resisted = MAX_PULL * (1 - 1 / (magnitude * RESISTANCE / MAX_PULL + 1));
  return Math.sign(distance) * resisted;
}

function isIgnoredTarget(target) {
  return !!(target instanceof Element && target.closest(IGNORE_TARGET));
}

function wheelDistance(event) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  return Math.min(MAX_WHEEL_STEP, Math.abs(event.deltaY * unit));
}

export function useScrollBounce(targetRef) {
  let target = null;
  let touchState = null;
  let rawPull = 0;
  let offset = 0;
  let wheelDirection = 0;
  let wheelActive = false;
  let settleTimer = null;
  let wheelTimer = null;
  let clickTimer = null;
  let suppressClick = false;

  function clearTimer(timer) {
    if (timer) window.clearTimeout(timer);
    return null;
  }

  function clearMotionTimers() {
    settleTimer = clearTimer(settleTimer);
    wheelTimer = clearTimer(wheelTimer);
    wheelActive = false;
  }

  function resolveScroller() {
    if (!target) return null;
    if (target.scrollHeight > target.clientHeight + 1) return target;
    return document.scrollingElement || document.documentElement;
  }

  function boundaryOf(scroller) {
    if (!scroller) return { scrollable: false, top: false, bottom: false };
    return {
      scrollable: scroller.scrollHeight > scroller.clientHeight + 1,
      top: scroller.scrollTop <= 1,
      bottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
    };
  }

  function beginVisual() {
    if (!target) return;
    clearMotionTimers();
    target.style.transition = 'none';
    target.style.willChange = 'transform';
  }

  function writeOffset(value) {
    offset = value;
    if (!target) return;
    if (!value) {
      target.style.transform = '';
      return;
    }
    target.style.transform = `translate3d(0, ${value.toFixed(2)}px, 0)`;
  }

  function resetVisual() {
    clearMotionTimers();
    rawPull = 0;
    offset = 0;
    wheelDirection = 0;
    if (!target) return;
    target.style.transition = '';
    target.style.transform = '';
    target.style.willChange = '';
  }

  function settle() {
    clearMotionTimers();
    wheelDirection = 0;
    if (!target || Math.abs(offset) < 0.5) {
      resetVisual();
      return;
    }
    rawPull = 0;
    if (prefersReducedMotion()) {
      resetVisual();
      return;
    }
    target.style.transition = `transform ${SETTLE_MS}ms var(--md-ease-spring)`;
    target.style.transform = 'translate3d(0, 0, 0)';
    target.style.willChange = 'transform';
    offset = 0;
    settleTimer = window.setTimeout(resetVisual, SETTLE_MS + 60);
  }

  function armClickGuard() {
    suppressClick = true;
    clickTimer = clearTimer(clickTimer);
    clickTimer = window.setTimeout(() => {
      suppressClick = false;
      clickTimer = null;
    }, CLICK_GUARD_MS);
  }

  function onDocumentClick(event) {
    if (!suppressClick) return;
    suppressClick = false;
    clickTimer = clearTimer(clickTimer);
    event.preventDefault();
    event.stopPropagation();
  }

  function onTouchStart(event) {
    touchState = null;
    if (event.touches.length !== 1 || prefersReducedMotion() || isIgnoredTarget(event.target)) return;
    const scroller = resolveScroller();
    if (!boundaryOf(scroller).scrollable) return;

    resetVisual();
    const touch = event.touches[0];
    touchState = {
      scroller,
      lastX: touch.clientX,
      lastY: touch.clientY,
      totalX: 0,
      totalY: 0,
      direction: 0,
      pulling: false
    };
  }

  function onTouchMove(event) {
    if (!touchState) return;
    if (event.touches.length !== 1) {
      onTouchCancel();
      return;
    }

    const touch = event.touches[0];
    const dx = touch.clientX - touchState.lastX;
    const dy = touch.clientY - touchState.lastY;
    touchState.lastX = touch.clientX;
    touchState.lastY = touch.clientY;
    touchState.totalX += dx;
    touchState.totalY += dy;

    if (!touchState.pulling) {
      const horizontal = Math.abs(touchState.totalX);
      const vertical = Math.abs(touchState.totalY);
      if (vertical < 4 || vertical <= horizontal * 1.15) return;

      const boundary = boundaryOf(touchState.scroller);
      const direction = touchState.totalY > 0 ? 1 : -1;
      const atEdge = direction > 0 ? boundary.top : boundary.bottom;
      if (!boundary.scrollable || !atEdge || !event.cancelable) return;

      touchState.direction = direction;
      touchState.pulling = true;
      beginVisual();
    }

    if (!event.cancelable) return;

    const boundary = boundaryOf(touchState.scroller);
    const stillAtEdge = touchState.direction > 0 ? boundary.top : boundary.bottom;
    if (!stillAtEdge) {
      rawPull = 0;
      writeOffset(0);
      event.preventDefault();
      return;
    }

    const nextPull = touchState.direction > 0
      ? Math.max(0, Math.min(MAX_RAW_PULL, rawPull + dy))
      : Math.max(-MAX_RAW_PULL, Math.min(0, rawPull + dy));

    // 反向推回零点后交还给原生滚动，避免拉一下就要松手才能继续翻
    if (rawPull !== 0 && nextPull === 0 && dy * touchState.direction < 0) {
      touchState.pulling = false;
      touchState.totalX = 0;
      touchState.totalY = 0;
      rawPull = 0;
      writeOffset(0);
      return;
    }

    rawPull = nextPull;
    event.preventDefault();
    writeOffset(rubberBand(rawPull));
  }

  function finishTouch(allowClick = true) {
    const pulled = !!(touchState && touchState.pulling && Math.abs(offset) >= 0.5);
    touchState = null;
    if (!pulled) {
      resetVisual();
      return;
    }
    if (allowClick) armClickGuard();
    settle();
  }

  function onTouchEnd(event) {
    if (!touchState) return;
    const pulled = touchState.pulling && Math.abs(offset) >= 0.5;
    if (pulled && event.cancelable) event.preventDefault();
    finishTouch(true);
  }

  function onTouchCancel() {
    if (!touchState) return;
    finishTouch(false);
  }

  function onWheel(event) {
    if (event.ctrlKey || event.metaKey || !event.cancelable || prefersReducedMotion()) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || isIgnoredTarget(event.target)) return;

    const boundary = boundaryOf(resolveScroller());
    const direction = event.deltaY < 0 ? 1 : -1;
    const atEdge = direction > 0 ? boundary.top : boundary.bottom;
    if (!boundary.scrollable || !atEdge) return;

    const delta = wheelDistance(event);
    if (!delta) return;
    event.preventDefault();

    if (wheelDirection !== direction) {
      rawPull = 0;
      wheelDirection = direction;
    }
    if (!wheelActive) {
      beginVisual();
      wheelActive = true;
    }

    rawPull = direction > 0
      ? Math.min(MAX_RAW_PULL, rawPull + delta)
      : Math.max(-MAX_RAW_PULL, rawPull - delta);
    writeOffset(rubberBand(rawPull));

    wheelTimer = clearTimer(wheelTimer);
    wheelTimer = window.setTimeout(() => {
      wheelTimer = null;
      wheelActive = false;
      wheelDirection = 0;
      settle();
    }, WHEEL_SETTLE_MS);
  }

  function unbind() {
    if (target) {
      target.removeEventListener('touchstart', onTouchStart);
      target.removeEventListener('touchmove', onTouchMove);
      target.removeEventListener('touchend', onTouchEnd);
      target.removeEventListener('touchcancel', onTouchCancel);
      target.removeEventListener('wheel', onWheel);
    }
    document.removeEventListener('click', onDocumentClick, true);
    touchState = null;
    rawPull = 0;
    offset = 0;
    suppressClick = false;
    clearMotionTimers();
    clickTimer = clearTimer(clickTimer);
    if (target) {
      target.style.transition = '';
      target.style.transform = '';
      target.style.willChange = '';
    }
    target = null;
  }

  function bind(element) {
    unbind();
    if (!element) return;
    target = element;
    target.addEventListener('touchstart', onTouchStart, { passive: true });
    target.addEventListener('touchmove', onTouchMove, { passive: false });
    target.addEventListener('touchend', onTouchEnd, { passive: false });
    target.addEventListener('touchcancel', onTouchCancel, { passive: false });
    target.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('click', onDocumentClick, true);
  }

  watch(targetRef, bind, { immediate: true, flush: 'post' });
  onBeforeUnmount(unbind);
}
