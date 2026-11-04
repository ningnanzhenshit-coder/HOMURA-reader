/* ============================================================================
   HOMURA · Vue 3 应用入口
   ========================================================================== */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { isAndroid } from './services/platform.js';
import './assets/homura.css';

// 平台标记只用于渲染性能降级，不参与业务判断
document.documentElement.dataset.platform = isAndroid ? 'android' : 'desktop';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
