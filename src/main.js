/* ============================================================================
   HOMURA · Vue 3 应用入口
   ========================================================================== */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/homura.css';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
