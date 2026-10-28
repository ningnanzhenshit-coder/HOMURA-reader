/* ============================================================================
   HOMURA · Toast 提示（响应式）
   ----------------------------------------------------------------------------
   模块级响应式状态，services 与组件均可直接调 showToast()；
   App.vue 中的 Toast 组件根据 message/token 渲染与自动隐藏。
   ========================================================================== */

import { reactive } from 'vue';

const toastState = reactive({
  message: '',
  token: 0
});

let hideTimer = null;

export function showToast(msg) {
  toastState.message = msg;
  toastState.token++;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toastState.message = '';
  }, 2200);
}

export function useToast() {
  return toastState;
}
