<template>
  <!-- 全局轻提示：品牌色渐变胶囊 + 淡入 / 淡出过渡 -->
  <transition name="toast-fade">
    <div
      v-if="toast.message"
      class="homura-toast"
      :style="toastStyle"
      role="status"
      aria-live="polite"
    >
      <span class="homura-toast__mark" aria-hidden="true"></span>
      <span class="homura-toast__text">{{ toast.message }}</span>
    </div>
  </transition>
</template>

<script setup>
import { computed } from 'vue';
import { useToast } from '../composables/useToast.js';
import { useReaderStore } from '../stores/reader.js';
import { useViewport } from '../composables/useViewport.js';

const toast = useToast();
const reader = useReaderStore();
const { isCompact } = useViewport();

// 阅读器让开顶部安全区与工具栏；手机书架把提示放到拇指区上方，避免压住筛选栏。
const toastStyle = computed(() => {
  if (reader.currentBook) {
    return { left: '50%', top: 'calc(env(safe-area-inset-top) + 4.5rem)' };
  }
  if (isCompact.value) {
    return {
      left: '50%',
      top: 'auto',
      bottom: 'calc(5rem + env(safe-area-inset-bottom) + 5.25rem)'
    };
  }
  return null;
});
</script>

<style scoped>
.homura-toast {
  position: fixed;
  left: calc(50% + var(--sidenav-width, 96px) / 2);
  top: 1.5rem;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: min(88vw, 34rem);
  padding: 0.6rem 1.1rem 0.6rem 0.9rem;
  border-radius: 999px;
  color: var(--md-on-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.55;
  text-align: center;
  background-image: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-hover) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 10px 28px -12px var(--brand-primary),
    0 2px 8px rgba(15, 23, 42, 0.16);
  filter: blur(0px);
  transform: translate(-50%, 0) scale(1);
  transition:
    left 0.2s ease-out,
    top 0.2s ease-out,
    bottom 0.2s ease-out;
  pointer-events: none;
  will-change: opacity, transform, filter;
}

/* 左侧呼吸点，给静态文案一点活气 */
.homura-toast__mark {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--md-on-primary);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.16);
}

.homura-toast__text {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* 淡入：从上方落下 + 缩放回弹 + 去模糊，节奏放慢更醒目 */
.toast-fade-enter-active {
  transition:
    opacity 0.34s ease-out,
    transform 0.52s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.34s ease-out;
}

/* 淡出：加速上收并轻微模糊，干脆收尾 */
.toast-fade-leave-active {
  transition:
    opacity 0.24s ease-in,
    transform 0.3s cubic-bezier(0.4, 0, 1, 1),
    filter 0.24s ease-in;
}

.toast-fade-enter-from {
  opacity: 0;
  filter: blur(8px);
  transform: translate(-50%, -28px) scale(0.88);
}

.toast-fade-leave-to {
  opacity: 0;
  filter: blur(5px);
  transform: translate(-50%, -18px) scale(0.94);
}

/* 尊重系统的「减少动态效果」设置：只保留纯淡入淡出 */
@media (prefers-reduced-motion: reduce) {
  .homura-toast {
    transition: none;
  }

  .toast-fade-enter-active,
  .toast-fade-leave-active {
    transition: opacity 0.14s linear;
  }

  .toast-fade-enter-from,
  .toast-fade-leave-to {
    filter: none;
    transform: translate(-50%, 0);
  }
}
</style>
