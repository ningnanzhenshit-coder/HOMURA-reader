import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
// pdf.js 运行时按名字请求这些资源，不能走 import 打包
const PDFJS_ASSET_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];

function syncPdfjsAssets() {
  for (const dir of PDFJS_ASSET_DIRS) {
    const dest = path.join(rootDir, 'public/pdfjs', dir);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(path.join(rootDir, 'node_modules/pdfjs-dist', dir), dest, { recursive: true });
  }
}

// 把 pdf.js 的 CMap / 标准字体 / wasm 解码器同步到 public/pdfjs，
// 开发时直接由 public 目录提供，构建时随 public 一起进 dist
function pdfjsAssets() {
  return {
    name: 'homura-pdfjs-assets',
    buildStart: syncPdfjsAssets,
    configureServer: syncPdfjsAssets
  };
}

// Tauri 要求相对路径产物；端口固定 5173 与 tauri.conf.json 的 devUrl 对齐
export default defineConfig({
  plugins: [vue(), pdfjsAssets()],
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
