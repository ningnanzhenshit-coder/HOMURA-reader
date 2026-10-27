import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 跳过 .DS_Store 等隐藏文件，避免系统垃圾混进构建产物
const skipHidden = (source) => !path.basename(source).startsWith('.');

// 只拷贝前端资源，避免把 src-tauri 与 node_modules 打进应用
const entries = ['homura-ultra.html', 'css', 'js'];
for (const entry of entries) {
  await cp(path.join(src, entry), path.join(dist, entry), { recursive: true, filter: skipHidden });
}

// Tauri 默认加载 index.html，这里用入口页副本做别名，保持原文件路径不变
await cp(path.join(src, 'homura-ultra.html'), path.join(dist, 'index.html'), { filter: skipHidden });

console.log('[prepare-web] 已生成 dist/');
