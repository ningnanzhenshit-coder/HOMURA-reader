<template>
  <!-- 触屏手势层：左 1/3 上一页 / 中 1/3 切换工具栏 / 右 1/3 下一页，横向滑动跟手
       z-30 必须高于翻页舞台激活层的 z-20，否则指针事件会被图片层吃掉 -->
  <div
    v-if="showGestures"
    ref="gestureEl"
    class="reader-gesture-layer fixed inset-0 z-30 select-none"
    @click.stop.prevent="onGestureClick"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @contextmenu.prevent
  ></div>

  <!-- Hardware-Accelerated Double-Buffer Stage -->
  <div class="relative w-full h-full overflow-hidden">
    <div
      v-for="slot in [0, 1]"
      :key="slot"
      :ref="el => { if (el) stageEls[slot] = el; }"
      class="stage-buffer-layer"
      :class="slot === 0 ? 'z-20' : 'z-10 pointer-events-none'"
      :style="slot === 0 ? 'opacity: 1; transform: translate3d(0,0,0);' : 'opacity: 0; transform: translate3d(0,0,0);'"
    >
      <!-- Manga: 1P Single -->
      <template v-if="isManga">
        <div class="w-full h-full items-center justify-center overflow-hidden" :class="slotVMs[slot] && slotVMs[slot].mode === 'single' ? 'flex' : 'hidden'">
          <img :ref="el => { if (el) imgEls[slot].single = el; }" class="manga-page-img h-full w-auto max-w-full object-contain select-none" />
        </div>
        <!-- Manga: 2P Double -->
        <div class="w-full h-full items-center justify-center overflow-hidden" :class="slotVMs[slot] && slotVMs[slot].mode === 'double' ? 'flex' : 'hidden'">
          <div class="flex items-center justify-center w-full h-full relative">
            <div class="w-1/2 h-full flex items-center justify-end overflow-hidden">
              <img :ref="el => { if (el) imgEls[slot].left = el; }" class="manga-page-img h-full max-h-full w-auto max-w-full object-contain object-right select-none" />
            </div>
            <div class="w-2 h-full book-spine-shadow pointer-events-none z-10 shrink-0"></div>
            <div class="w-1/2 h-full flex items-center justify-start overflow-hidden">
              <img :ref="el => { if (el) imgEls[slot].right = el; }" class="manga-page-img h-full max-h-full w-auto max-w-full object-contain object-left select-none" />
            </div>
          </div>
        </div>
      </template>

      <!-- Novel: 1P Single -->
      <template v-else>
        <div
          class="w-full h-full items-center justify-center p-2 sm:p-4 overflow-hidden"
          :class="slotVMs[slot] && slotVMs[slot].mode === 'single' ? 'flex' : 'hidden'"
          :style="paperSafeAreaStyle"
        >
          <NovelCard
            v-if="slotVMs[slot] && slotVMs[slot].single"
            :page="slotVMs[slot].single"
            :side-label="slotVMs[slot].singleLabel"
            :total="slotVMs[slot].total"
            :font-size="reader.layoutConfig.fontSize"
          />
        </div>
        <!-- Novel: 2P Double -->
        <div
          class="w-full h-full max-w-6xl mx-auto flex-col md:flex-row items-stretch justify-center gap-3 p-2 sm:p-4 relative z-0 overflow-hidden"
          :class="slotVMs[slot] && slotVMs[slot].mode === 'double' ? 'flex' : 'hidden'"
          :style="paperSafeAreaStyle"
        >
          <template v-if="slotVMs[slot] && slotVMs[slot].mode === 'double'">
            <NovelCard :page="slotVMs[slot].left" :side-label="slotVMs[slot].leftLabel" :total="slotVMs[slot].total" :font-size="reader.layoutConfig.fontSize" />
            <NovelCard :page="slotVMs[slot].right" :side-label="slotVMs[slot].rightLabel" :total="slotVMs[slot].total" :font-size="reader.layoutConfig.fontSize" />
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
/* ============================================================================
   HOMURA · 双缓冲翻页引擎（原 renderer.js 的 Vue 化）
   ----------------------------------------------------------------------------
   两个 buffer 槽位交替上屏：先在离屏槽位填充内容并解码图片，再用 Web
   Animations API 在合成器线程跑翻页动画，动画结束后才后台预解码后续页。
   buffer 槽位的显隐 / z-index / transform 全部直操作 ref DOM，不经响应式，
   避免 Vue 重渲染打断进行中的动画。
   ========================================================================== */

import { shallowRef, computed, onMounted, onBeforeUnmount, nextTick, ref } from 'vue';
import { useReaderStore } from '../stores/reader.js';
import { useThemeStore } from '../stores/theme.js';
import { useUiStore } from '../stores/ui.js';
import { useViewport } from '../composables/useViewport.js';
import { ensurePageUrlLoaded, decodeImgIntoElement } from '../services/pagination.js';
import NovelCard from './NovelCard.vue';

const reader = useReaderStore();
const theme = useThemeStore();
const ui = useUiStore();
const { isTouch, isPhone, isCompact } = useViewport();

// 触屏或手机宽度都启用手势层：部分 WebView 的 pointer/hover 媒体查询会失真
const showGestures = computed(() => isTouch.value || isPhone.value);

const gestureEl = ref(null);

const isManga = computed(() => reader.currentBook && reader.currentBook.type === 'manga');
const paperSafeAreaStyle = computed(() => (
  isCompact.value
    ? {
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)'
      }
    : null
));

// 每个槽位的视图模型：single / double 模式 + 页面 + 阅读顺序标签
const slotVMs = shallowRef([null, null]);

// 直操作 DOM 引用：stage 层与 manga img（不挂响应式）
const stageEls = [null, null];
const imgEls = [{ single: null, left: null, right: null }, { single: null, left: null, right: null }];

// 组件按 书 id+type key 重挂载，首次渲染只填槽位 0、无动画
let initialized = false;

function buildSlotVM(pair, total) {
  const rtl = reader.layoutConfig.direction === 'rtl';
  if (pair.length === 1) {
    return {
      mode: 'single',
      single: pair[0],
      singleLabel: rtl ? '[右→左]' : '[左→右]',
      total
    };
  }
  const left = rtl ? pair[1] : pair[0];
  const right = rtl ? pair[0] : pair[1];
  return {
    mode: 'double',
    left,
    right,
    leftLabel: rtl ? '左页(后读)' : '左页(先读)',
    rightLabel: rtl ? '右页(先读)' : '右页(后读)',
    total
  };
}

// Populate a target buffer slot (0 or 1) and decode its images BEFORE starting the transition
async function populateBufferSlot(slotIndex, pair, total) {
  if (isManga.value) {
    for (const p of pair) {
      await ensurePageUrlLoaded(p.itemRef);
    }
  }
  const vm = buildSlotVM(pair, total);
  const next = slotVMs.value.slice();
  next[slotIndex] = vm;
  slotVMs.value = next;
  // 等 Vue 把槽位内容（包装显隐 / 小说 v-html）patch 进 DOM 后再解码或开启动画
  await nextTick();

  if (isManga.value) {
    if (vm.mode === 'single') {
      await decodeImgIntoElement(imgEls[slotIndex].single, vm.single.itemRef.url);
    } else {
      await Promise.all([
        decodeImgIntoElement(imgEls[slotIndex].left, vm.left.itemRef.url),
        decodeImgIntoElement(imgEls[slotIndex].right, vm.right.itemRef.url)
      ]);
    }
  }
}

async function renderReaderViewport(transitionDir = 'fade') {
  if (!reader.currentBook) return;
  const myToken = ++reader.renderToken;

  // Pause any background ZIP preloading while preparing or running page turn animation
  clearTimeout(reader.preloadTimer);

  const total = reader.activePages.length;
  reader.sliderValue = reader.currentIndex;
  // 所有翻页 / 跳页 / 重排最终都会经过这里，统一防抖记录阅读位置
  reader.touchProgress();

  const pair = reader.getSpreadPair(reader.currentIndex);
  reader.pageIndicator = `${pair.map(p => p.pageNumber).join('-')} / ${total}`;

  if (!initialized) {
    initialized = true;
    reader.activeBufferSlot = 0;
    await populateBufferSlot(0, pair, total);
    if (myToken !== reader.renderToken) return;
    scheduleIdlePreload();
    return;
  }

  // Prepare the STANDBY buffer off-screen while the current buffer remains 100% stable on screen!
  const prevSlot = reader.activeBufferSlot;
  const nextSlot = 1 - reader.activeBufferSlot;

  await populateBufferSlot(nextSlot, pair, total);
  if (myToken !== reader.renderToken) return;

  // Cancel any ongoing Web Animations cleanly before starting the new transition
  reader.activeTransitionAnims.forEach(anim => {
    try { anim.cancel(); } catch (e) {}
  });
  reader.activeTransitionAnims = [];

  const outEl = stageEls[prevSlot];
  const inEl = stageEls[nextSlot];
  reader.activeBufferSlot = nextSlot;

  inEl.style.zIndex = '20';
  inEl.classList.remove('pointer-events-none');
  outEl.style.zIndex = '10';
  outEl.classList.add('pointer-events-none');

  const styleMode = theme.transitionStyle;

  if (styleMode === 'none' || transitionDir === 'none' || !outEl.animate) {
    inEl.style.opacity = '1';
    inEl.style.transform = 'translate3d(0, 0, 0)';
    outEl.style.opacity = '0';
    outEl.style.transform = 'translate3d(0, 0, 0)';
    scheduleIdlePreload();
    return;
  }

  // Determine smooth GPU keyframes using Web Animations API (runs on compositor thread, never janks!)
  const duration = styleMode === 'slide' ? 260 : 200;
  const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

  let inKeyframes, outKeyframes;
  if (styleMode === 'slide' && (transitionDir === 'enter-from-right' || transitionDir === 'enter-from-left')) {
    const enterOffset = transitionDir === 'enter-from-right' ? '14%' : '-14%';
    const exitOffset = transitionDir === 'enter-from-right' ? '-10%' : '10%';

    inKeyframes = [
      { transform: `translate3d(${enterOffset}, 0, 0) scale(0.992)`, opacity: 0 },
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
    ];
    outKeyframes = [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: `translate3d(${exitOffset}, 0, 0) scale(0.992)`, opacity: 0 }
    ];
  } else {
    inKeyframes = [
      { transform: 'translate3d(0, 0, 0) scale(0.994)', opacity: 0 },
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
    ];
    outKeyframes = [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: 'translate3d(0, 0, 0) scale(0.996)', opacity: 0 }
    ];
  }

  inEl.style.opacity = '1';
  outEl.style.opacity = '0';

  const animIn = inEl.animate(inKeyframes, { duration, easing, fill: 'forwards' });
  const animOut = outEl.animate(outKeyframes, { duration, easing, fill: 'forwards' });
  reader.activeTransitionAnims = [animIn, animOut];

  animIn.onfinish = () => {
    inEl.style.transform = 'translate3d(0, 0, 0)';
    inEl.style.opacity = '1';
    outEl.style.transform = 'translate3d(0, 0, 0)';
    outEl.style.opacity = '0';
    scheduleIdlePreload();
  };
}

// Background Preloader: Only runs AFTER page turn animation completes so animation never drops a frame!
function scheduleIdlePreload() {
  clearTimeout(reader.preloadTimer);
  if (!reader.currentBook || reader.currentBook.type !== 'manga') return;

  reader.preloadTimer = setTimeout(async () => {
    for (let i = 1; i <= 4; i++) {
      const nextPage = reader.activePages[reader.currentIndex + i];
      if (nextPage && nextPage.itemRef && !nextPage.itemRef.url) {
        const url = await ensurePageUrlLoaded(nextPage.itemRef);
        if (url) {
          const img = new Image();
          img.src = url;
          if (img.decode) {
            try { await img.decode(); } catch (e) {}
          }
        }
      }
    }
  }, 280);
}

// ---- 触屏手势：横向滑动跟手 + 三段式点击 ----
const drag = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  startTime: 0,
  dx: 0,
  dy: 0,
  axis: null,
  canSwipeBack: false
};

function activeStageEl() {
  return stageEls[reader.activeBufferSlot];
}

// 拖拽阻尼：前半段跟手，超出后明显变沉，避免整页被拖出屏幕
function dampedOffset(dx) {
  const limit = (window.innerWidth || 375) * 0.22;
  const sign = dx < 0 ? -1 : 1;
  const abs = Math.abs(dx);
  if (abs <= limit) return dx * 0.55;
  return sign * (limit * 0.55 + (abs - limit) * 0.12);
}

function resetStageTransform() {
  const el = activeStageEl();
  if (el) el.style.transform = 'translate3d(0, 0, 0)';
}

function onPointerDown(e) {
  if (e.pointerType === 'mouse' || !reader.currentBook) return;
  // 打断进行中的翻页动画，避免手势与动画争抢同一层的 transform
  reader.activeTransitionAnims.forEach(anim => {
    try { anim.cancel(); } catch (err) {}
  });
  reader.activeTransitionAnims = [];
  drag.active = true;
  drag.pointerId = e.pointerId;
  drag.startX = e.clientX;
  drag.startY = e.clientY;
  drag.startTime = Date.now();
  drag.dx = 0;
  drag.dy = 0;
  drag.axis = null;
  // 移动端：第一页任意位置右滑，或任意页从左边缘右滑，返回书架
  drag.canSwipeBack = isCompact.value && (drag.startX <= 28 || reader.currentIndex === 0);
  if (gestureEl.value) {
    try { gestureEl.value.setPointerCapture(e.pointerId); } catch (err) {}
  }
}

function onPointerMove(e) {
  if (!drag.active || e.pointerId !== drag.pointerId) return;
  drag.dx = e.clientX - drag.startX;
  drag.dy = e.clientY - drag.startY;
  const absX = Math.abs(drag.dx);
  const absY = Math.abs(drag.dy);
  if (!drag.axis && (absX > 8 || absY > 8)) {
    drag.axis = absX >= absY ? 'x' : 'y';
  }
  // 手指起始方向常有竖向抖动：横向位移明显占优时改判为横向手势
  if (drag.axis === 'y' && absX > 16 && absX > absY * 1.4) {
    drag.axis = 'x';
  }
  if (drag.axis === 'x') {
    const el = activeStageEl();
    if (el) el.style.transform = `translate3d(${dampedOffset(drag.dx)}px, 0, 0)`;
  }
}

function onPointerUp(e) {
  if (!drag.active || e.pointerId !== drag.pointerId) return;
  drag.active = false;
  drag.pointerId = null;

  const dx = drag.dx;
  const dy = drag.dy;
  const dt = Math.max(1, Date.now() - drag.startTime);
  const velocity = Math.abs(dx) / dt;
  const threshold = Math.max(48, (window.innerWidth || 375) * 0.14);
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  // 以最终位移比例判定是否横向翻页，避免起始抖动把意图锁死成纵向
  const horizontal = absX > 24 && absX > absY * 1.2;
  const el = activeStageEl();

  if (horizontal) {
    const crossedThreshold = absX > threshold || (velocity > 0.45 && absX > 20);
    if (drag.canSwipeBack && dx > 0 && crossedThreshold) {
      resetStageTransform();
      // 等当前 pointer 序列的 click 走完再卸载阅读器，避免穿透到书架卡片
      event.preventDefault();
      requestAnimationFrame(() => reader.closeReader());
      return;
    }
    if (crossedThreshold) {
      resetStageTransform();
      if (dx > 0) reader.onLeftButtonClick();
      else reader.onRightButtonClick();
      return;
    }
    // 未过阈值：回弹
    if (el && el.animate) {
      el.style.transform = 'translate3d(0, 0, 0)';
      el.animate(
        [
          { transform: `translate3d(${dampedOffset(dx)}px, 0, 0)` },
          { transform: 'translate3d(0, 0, 0)' }
        ],
        { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      );
    } else {
      resetStageTransform();
    }
    return;
  }

  // 轻点：左 1/3 上一页，右 1/3 下一页，中间切换工具栏
  if (absX < 8 && absY < 8 && dt < 350) {
    const ratio = e.clientX / (window.innerWidth || 1);
    if (ratio < 0.3) reader.onLeftButtonClick();
    else if (ratio > 0.7) reader.onRightButtonClick();
    else ui.toggleChrome();
  }
}

function onPointerCancel() {
  if (!drag.active) return;
  drag.active = false;
  drag.pointerId = null;
  resetStageTransform();
}

// 手势层只认触摸指针；窄窗口用鼠标调试时补一条「轻点中间切换工具栏」
function onGestureClick() {
  if (isTouch.value) return;
  ui.toggleChrome();
}

onMounted(() => {
  reader.renderFn = renderReaderViewport;
  // store 动作可能在组件挂载前就已完成分页，这里自检后直接首渲染
  if (reader.activePages.length > 0) {
    renderReaderViewport('none');
  }
});

onBeforeUnmount(() => {
  reader.renderFn = null;
  reader.activeTransitionAnims.forEach(anim => {
    try { anim.cancel(); } catch (e) {}
  });
  reader.activeTransitionAnims = [];
  const el = activeStageEl();
  if (el) el.style.transform = 'translate3d(0, 0, 0)';
});
</script>
