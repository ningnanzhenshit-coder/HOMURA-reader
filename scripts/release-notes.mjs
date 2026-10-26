import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

// 生成 Release 说明：静态安装信息 + 基于 Conventional Commits 的自动更新日志
const repo = process.env.GITHUB_REPOSITORY || 'ningnanzhenshit-coder/homura-reader';
const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const tag = process.env.GITHUB_REF_NAME || `v${version}`;

const SECTIONS = [
  ['feat', '✨ 新功能'],
  ['fix', '🐛 问题修复'],
  ['perf', '⚡ 性能优化'],
  ['refactor', '♻️ 重构'],
  ['docs', '📚 文档'],
  ['build', '🔧 构建与 CI'],
  ['misc', '🧹 其他']
];

const SECTION_OF = {
  feat: 'feat',
  fix: 'fix',
  perf: 'perf',
  refactor: 'refactor',
  docs: 'docs',
  build: 'build',
  ci: 'build',
  chore: 'misc',
  style: 'misc',
  test: 'misc',
  revert: 'misc'
};

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// 找到当前 tag 之前的最近一个 tag；首个版本没有上一版
let previousTag = null;
try {
  previousTag = git(['describe', '--tags', '--abbrev=0', `${tag}^`]);
} catch {
  previousTag = null;
}

let changelog = '首个版本，包含完整的本地阅读体验。';

if (previousTag) {
  const lines = git(['log', `${previousTag}..${tag}`, '--no-merges', '--pretty=format:%h%x09%s'])
    .split('\n')
    .filter(Boolean);

  const groups = new Map(SECTIONS.map(([key]) => [key, []]));

  for (const line of lines) {
    const tab = line.indexOf('\t');
    const hash = line.slice(0, tab);
    const subject = line.slice(tab + 1);
    // 发版提交本身不算更新内容
    if (/^chore\(release\)/i.test(subject)) continue;
    const match = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
    const section = SECTION_OF[match ? match[1].toLowerCase() : ''] || 'misc';
    const desc = match ? match[3] : subject;
    groups.get(section).push(`- ${desc}（[${hash}](${server}/${repo}/commit/${hash})）`);
  }

  const blocks = SECTIONS.filter(([key]) => groups.get(key).length).map(
    ([key, label]) => `### ${label}\n\n${groups.get(key).join('\n')}`
  );

  changelog = blocks.join('\n\n') || '本次发布无用户可见变更。';
  changelog += `\n\n**完整对比**：[${previousTag}...${tag}](${server}/${repo}/compare/${previousTag}...${tag})`;
}

const body = `# HOMURA ${tag}

本地优先的 ACGN 漫画与轻小说阅读器，现已支持 macOS、Windows 与 Linux。
解析与渲染全部在本地完成，不上传任何文件。

## 🔄 更新日志

${changelog}

## ✨ 功能亮点

- **格式通吃**：EPUB / KEPUB / CBZ / ZIP / TXT / Markdown，以及整文件夹漫画导入
- **四种阅读姿势**：单页、双页、日漫右→左、上下条漫
- **护眼三件套**：白昼 / 暖色护眼 / 夜间模式，搭配蓝、红、绿、紫四色主题
- **翻页手感**：丝滑平移、柔和淡入、极速无动画，可自由切换
- **顺手操作**：滚轮翻页、键盘快捷键、全屏沉浸模式
- **书架持久化**：导入的作品、封面与源文件存入本地 IndexedDB，重启后自动恢复
- **离线可用**：Tailwind 与 JSZip 已内置于应用，断网也能正常阅读

## 📦 下载安装

| 平台 | 安装包 |
| --- | --- |
| macOS | \`.dmg\`（Universal，Apple Silicon + Intel） |
| Windows | \`.msi\` 或 NSIS \`-setup.exe\` |
| Linux | \`.AppImage\` / \`.deb\` / \`.rpm\` |

## 🍎 macOS 首次打开

当前安装包尚未做 Apple 开发者签名。若系统提示「无法验证开发者」：

1. 在 Finder 中右键 \`HOMURA.app\` → **打开**；或
2. 终端执行：\`xattr -cr /Applications/HOMURA.app\`

## 🛠 从源码构建

\`\`\`bash
npm install
npm run build
\`\`\`

构建产物位于 \`src-tauri/target/release/bundle/\`。

## 📌 说明

- 书架数据保存在本机 IndexedDB 中，卸载应用或清理站点数据会一并清除。
- 欢迎反馈问题与建议。
`;

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `body<<__RELEASE_BODY_EOF__\n${body}\n__RELEASE_BODY_EOF__\n`);
}

console.log(body);
