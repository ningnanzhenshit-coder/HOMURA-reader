import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// 唯一图标母版生成各平台图标，再同步页面和启动层需要的尺寸，避免旧素材残留。
const root = fileURLToPath(new URL('..', import.meta.url));
const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const manifest = JSON.parse(readFileSync(path.join(root, 'src-tauri/app-icon.json'), 'utf8'));
const source = path.resolve(root, 'src-tauri', manifest.default);
const temporary = mkdtempSync(path.join(os.tmpdir(), 'homura-icons-'));
try {
  // Android 自适应图标会被系统裁成不同形状，给完整书本和文字保留安全区。
  const scale = Math.min(100, Math.max(1, manifest.android_fg_scale || 66)) / 100;
  const size = 1024 * scale;
  const inset = (1024 - size) / 2;
  const foreground = path.join(temporary, 'foreground.svg');
  writeFileSync(foreground, `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><image x="${inset}" y="${inset}" width="${size}" height="${size}" href="data:image/png;base64,${readFileSync(source).toString('base64')}"/></svg>`);
  const input = path.join(temporary, 'icons.json');
  writeFileSync(input, JSON.stringify({ ...manifest, default: source, android_fg: foreground, android_fg_scale: 100 }));
  const result = spawnSync(process.execPath, [cli, 'icon', input, '--output', 'src-tauri/icons'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`图标生成失败：${result.status}`);
} finally {
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!path.resolve(temporary).startsWith(tempRoot) || !path.basename(temporary).startsWith('homura-icons-')) throw new Error('临时图标目录超出预期路径');
  rmSync(temporary, { recursive: true, force: true });
}
// 旧版背景 PNG 已由同名颜色资源取代，不再保留多份红色背景。
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  rmSync(path.join(root, 'src-tauri/icons/android', `mipmap-${density}`, 'ic_launcher_background.png'), { force: true });
}
cpSync(path.join(root, 'src-tauri/icons/128x128@2x.png'), path.join(root, 'public/favicon.png'));
cpSync(path.join(root, 'src-tauri/icons/icon.png'), path.join(root, 'public/splash-icon.png'));
if (existsSync(path.join(root, 'src-tauri/gen/android/app/src/main/res'))) {
  const sync = spawnSync(process.execPath, ['scripts/sync-android-icons.mjs'], { cwd: root, stdio: 'inherit' });
  if (sync.error) throw sync.error;
  if (sync.status !== 0) process.exit(sync.status || 1);
}
console.log('图标已同步至桌面、Android、网页和启动层。');
