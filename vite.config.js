import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Tauri 要求相对路径产物；端口固定 5173 与 tauri.conf.json 的 devUrl 对齐
export default defineConfig({
  plugins: [vue()],
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2021'
  }
});
