/* ============================================================================
   HOMURA · 手机底部 Sheet 下拉关闭
   ----------------------------------------------------------------------------
   从顶部拖拽条起手，位移直接写 DOM，避免手势期间触发响应式重渲染；
   超过阈值或快速下甩时关闭，否则回弹。支持减少动态效果偏好。
   ========================================================================== */

import { onBeforeUnmount, shallowRef, watch } from 'vue';

const SETTLE_MS = 200;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function useSheetDrag({ isCompact, isOpen, onClose }) {
  const sheetRef = shallowRef(null);
  let drag = null;
  let motionTimer = null;
  let closeAfterDrag = false;

  function clearMotionTimer() {
    if (motionTimer) {
      clearTimeout(motionTimer);
      motionTimer = null;
    }
  }

  function resetMotion() {
    clearMotionTimer();
    const activeDrag = drag;
    drag = null;
    if (activeDrag) {
      try {
        activeDrag.captureTarget.releasePointerCapture?.(activeDrag.pointerId);
      } catch (e) {}
    }
    const el = sheetRef.value;
    if (!el) return;
    el.style.transition = '';
    el.style.transform = '';
    el.style.willChange = '';
  }

  function onDragStart(event) {
    if (!isCompact.value || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (drag) return;
    const el = sheetRef.value;
    if (!el) return;

    clearMotionTimer();
    drag = {
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      startY: event.clientY,
      startedAt: performance.now(),
      offset: 0
    };
    el.style.transition = 'none';
    el.style.transform = 'translate3d(0, 0, 0)';
    el.style.willChange = 'transform';
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onDragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const el = sheetRef.value;
    if (!el) return;

    drag.offset = Math.max(0, event.clientY - drag.startY);
    el.style.transform = `translate3d(0, ${drag.offset}px, 0)`;
    event.preventDefault();
  }

  function onDragEnd(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const el = sheetRef.value;
    const activeDrag = drag;
    const elapsed = Math.max(performance.now() - activeDrag.startedAt, 1);
    const velocity = activeDrag.offset / elapsed;
    const closeThreshold = Math.min(112, (el?.offsetHeight || 480) * 0.22);
    const shouldClose = activeDrag.offset > closeThreshold || (activeDrag.offset > 24 && velocity > 0.6);
    const settleMs = prefersReducedMotion() ? 0 : SETTLE_MS;

    drag = null;
    try {
      activeDrag.captureTarget.releasePointerCapture?.(activeDrag.pointerId);
    } catch (e) {}

    if (!el) {
      if (shouldClose) onClose();
      return;
    }

    event.preventDefault();
    clearMotionTimer();

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearMotionTimer();
      el.removeEventListener('transitionend', onTransitionEnd);
      if (shouldClose) {
        // Sheet 已经移出屏幕，关闭时禁用二次离场动画，避免先弹回顶部再下滑
        closeAfterDrag = true;
        el.style.transition = 'none';
        el.style.transform = 'translate3d(0, 100%, 0)';
        onClose();
        return;
      }
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
    };
    const onTransitionEnd = transitionEvent => {
      if (transitionEvent.target === el && transitionEvent.propertyName === 'transform') finish();
    };

    el.style.transition = `transform ${settleMs}ms ${EASE}`;
    el.addEventListener('transitionend', onTransitionEnd);
    requestAnimationFrame(() => {
      el.style.transform = shouldClose ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)';
    });
    motionTimer = setTimeout(finish, settleMs + 40);
  }

  function onDragCancel(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { pointerId, captureTarget } = drag;
    drag = null;
    try {
      captureTarget.releasePointerCapture?.(pointerId);
    } catch (e) {}

    const el = sheetRef.value;
    if (!el) return;
    const settleMs = prefersReducedMotion() ? 0 : SETTLE_MS;
    el.style.transition = `transform ${settleMs}ms ${EASE}`;
    el.style.transform = 'translate3d(0, 0, 0)';
    clearMotionTimer();
    motionTimer = setTimeout(() => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
    }, settleMs + 40);
  }

  watch([isOpen, isCompact], ([open, compact]) => {
    if (open && compact) {
      closeAfterDrag = false;
      return;
    }
    if (!open && closeAfterDrag) closeAfterDrag = false;
    else resetMotion();
  });

  onBeforeUnmount(resetMotion);

  return {
    sheetRef,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel
  };
}
