import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { transform } from 'esbuild';
import tailwindConfig from './tailwind.config.js';

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

// 开发环境继续用运行时 Tailwind（HMR 即改即见）；生产构建时把用到的类
// 预编译成静态 CSS，避免 Play CDN 的 MutationObserver 每次 DOM 变化都
// 重新扫描全文档并生成整份样式。
async function compileTailwind(source) {
  const result = await postcss([tailwindcss(tailwindConfig), autoprefixer()])
    .process(source, { from: undefined });
  return (await transform(result.css, { loader: 'css', minify: true })).code;
}

function tailwindStatic() {
  let baseCss = '';
  let utilitiesCss = '';
  return {
    name: 'homura-tailwind-static',
    apply: 'build',
    enforce: 'post',
    async buildStart() {
      [baseCss, utilitiesCss] = await Promise.all([
        compileTailwind('@tailwind base; @tailwind components;'),
        compileTailwind('@tailwind utilities;')
      ]);
    },
    transformIndexHtml(html) {
      return {
        html: html.replace(/\s*<script src="vendor\/tailwind(?:-config)?\.js"><\/script>/g, ''),
        tags: [
          // preflight 仍放在最前，保持与运行时版本一致的层叠顺序
          { tag: 'style', attrs: { id: 'homura-tailwind-base' }, children: baseCss, injectTo: 'head-prepend' },
          // utilities 放到 body 末尾，确保能覆盖 homura.css 里的组件类
          { tag: 'style', attrs: { id: 'homura-tailwind' }, children: utilitiesCss, injectTo: 'body' }
        ]
      };
    },
    closeBundle() {
      // public/ 会被原样复制；生产包里不再需要运行时 Tailwind 的 441KB
      for (const name of ['tailwind.js', 'tailwind-config.js']) {
        fs.rmSync(path.join(rootDir, 'dist/vendor', name), { force: true });
      }
    }
  };
}

// Tauri 要求相对路径产物；端口固定 5173 与 tauri.conf.json 的 devUrl 对齐
export default defineConfig({
  plugins: [vue(), pdfjsAssets(), tailwindStatic()],
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // 原生构建产物不参与热更新，避免打包时误刷新正在阅读的页面。
    watch: { ignored: ['**/src-tauri/target/**', '**/src-tauri/gen/**'] }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2021'
  }
});
