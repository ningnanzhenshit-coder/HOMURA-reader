import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'src-tauri', 'icons', 'android');
const target = path.join(
  root,
  'src-tauri',
  'gen',
  'android',
  'app',
  'src',
  'main',
  'res'
);

if (!existsSync(source)) {
  throw new Error(`Android icon sources not found: ${source}`);
}

if (!existsSync(target)) {
  throw new Error(`Generated Android resources not found: ${target}`);
}

const iconDirs = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('mipmap-'))
  .map((entry) => entry.name);

if (!iconDirs.length) {
  throw new Error(`No Android mipmap directories found in: ${source}`);
}

for (const dir of iconDirs) {
  const destination = path.resolve(target, dir);
  if (!destination.startsWith(path.resolve(target) + path.sep)) throw new Error('Android 图标目标目录超出预期路径');
  rmSync(destination, { recursive: true, force: true });
  cpSync(path.join(source, dir), destination, { recursive: true });
}

// 只同步图标颜色文件，不替换应用现有的 values / 主题 / 字符串资源。
if (existsSync(path.join(source, 'values'))) {
  cpSync(path.join(source, 'values'), path.join(target, 'values'), { recursive: true });
}

console.log(`Synced Android launcher icons: ${iconDirs.join(', ')}`);
