/* ============================================================================
   HOMURA · 视口与输入设备探测
   ----------------------------------------------------------------------------
   三档断点：phone <= 767 / tablet 768-1023 / desktop >= 1024。
   isTouch 综合 (any-pointer: coarse) 与 maxTouchPoints，避免部分移动 WebView
   的 hover/pointer 媒体查询失真导致手势层不渲染。
   尺寸变化做 120ms 防抖，避免连续 resize 触发重复布局计算。
   ========================================================================== */

import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const PHONE_MAX = 767;
const TABLET_MAX = 1023;
const RESIZE_DEBOUNCE_MS = 120;
const TOUCH_QUERY = '(any-pointer: coarse)';

export function useViewport() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280);
  const isTouch = ref(false);

  let resizeTimer = null;
  let coarseQuery = null;

  function syncWidth() {
    width.value = window.innerWidth || 1280;
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(syncWidth, RESIZE_DEBOUNCE_MS);
  }

  // 有任意粗指针，或系统报告存在触摸点，即视为触屏设备
  function detectTouch() {
    return (coarseQuery && coarseQuery.matches) || (navigator.maxTouchPoints || 0) > 0;
  }

  function onCoarseChange() {
    isTouch.value = detectTouch();
  }

  onMounted(() => {
    syncWidth();
    coarseQuery = window.matchMedia(TOUCH_QUERY);
    isTouch.value = detectTouch();
    if (coarseQuery.addEventListener) {
      coarseQuery.addEventListener('change', onCoarseChange);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  });

  onBeforeUnmount(() => {
    clearTimeout(resizeTimer);
    if (coarseQuery && coarseQuery.removeEventListener) {
      coarseQuery.removeEventListener('change', onCoarseChange);
    }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
  });

  const isPhone = computed(() => width.value <= PHONE_MAX);
  const isTablet = computed(() => width.value > PHONE_MAX && width.value <= TABLET_MAX);
  const isDesktop = computed(() => width.value > TABLET_MAX);

  return { width, isPhone, isTablet, isDesktop, isTouch };
}
