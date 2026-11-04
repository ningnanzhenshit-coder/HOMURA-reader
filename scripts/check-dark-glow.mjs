/* ============================================================================
   HOMURA · 夜间泛光守卫
   ----------------------------------------------------------------------------
   夜间模式下 --md-on-surface / --md-on-surface-variant 会翻转成近白色。
   投影、柔光与遮罩必须使用 --md-shadow-color，否则会出现白色泛光。
   由 npm run build:vite 自动执行，也可单独运行 npm run check:dark-glow。
   ========================================================================== */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SOURCE_DIR = path.join(ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.css', '.vue']);
const FORBIDDEN_COLOR = /var\(\s*--md-on-surface(?:-variant)?\s*\)/i;
const WHITE_LITERAL = /(?:#fff(?:fff)?\b|rgba?\(\s*255\s*,\s*255\s*,\s*255\b|\bwhite\b|hsl\(\s*0(?:deg)?[\s,]+0%[\s,]+100%)/i;
const OVERLAY_SELECTOR = /::backdrop|backdrop|scrim|overlay|layer|dialog|drawer|sheet|modal|popover|mask/i;
const SHADOW_TOKEN = /--[\w-]*(?:shadow|elevation|scrim|overlay)[\w-]*/i;

function blankComments(source) {
  const blank = match => match.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function snippet(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function hasOverlayGlow(value) {
  if (!FORBIDDEN_COLOR.test(value) && !WHITE_LITERAL.test(value)) return false;
  if (!FORBIDDEN_COLOR.test(value)) return true;
  const percentages = [...value.matchAll(/(\d+(?:\.\d+)?)%/g)].map(match => Number(match[1]));
  return !percentages.length || percentages.some(amount => amount >= 20);
}

function addIssue(issues, source, file, index, rule, value) {
  issues.push({
    file,
    line: lineNumber(source, index),
    rule,
    snippet: snippet(value)
  });
}

export function lintDarkGlow(source, file = '<inline>') {
  const text = blankComments(source);
  const issues = [];

  for (const match of text.matchAll(/(?:box-shadow|boxShadow)\s*[:=]\s*([\s\S]*?)(?:;|}\s*)/g)) {
    const value = match[1];
    if (FORBIDDEN_COLOR.test(value) || WHITE_LITERAL.test(value)) {
      addIssue(issues, text, file, match.index, '投影使用了夜间会发白的颜色', match[0]);
    }
  }

  for (const match of text.matchAll(/(?:filter|text-shadow)\s*[:=]\s*([\s\S]*?)(?:;|}\s*)/g)) {
    const value = match[1];
    if (FORBIDDEN_COLOR.test(value) || WHITE_LITERAL.test(value)) {
      addIssue(issues, text, file, match.index, '柔光使用了夜间会发白的颜色', match[0]);
    }
  }

  for (const match of text.matchAll(/shadow-\[[^\]]*\]/g)) {
    const value = match[0];
    if (FORBIDDEN_COLOR.test(value) || WHITE_LITERAL.test(value)) {
      addIssue(issues, text, file, match.index, 'Tailwind 投影使用了夜间会发白的颜色', value);
    }
  }

  for (const match of text.matchAll(/(--[\w-]+)\s*:\s*([\s\S]*?)(?:;|}\s*)/g)) {
    const name = match[1];
    if (!SHADOW_TOKEN.test(name) || name === '--md-shadow-color') continue;
    const value = match[2];
    if (FORBIDDEN_COLOR.test(value) || WHITE_LITERAL.test(value)) {
      addIssue(issues, text, file, match.index, '阴影 / 遮罩 token 使用了夜间会发白的颜色', match[0]);
    }
  }

  for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    if (!OVERLAY_SELECTOR.test(selector)) continue;
    for (const match of rule[2].matchAll(/(?:background|background-color)\s*:\s*([^;]+);?/g)) {
      const value = match[1];
      if (hasOverlayGlow(value)) {
        addIssue(issues, text, file, rule.index + rule[0].indexOf(match[0]), '遮罩背景使用了夜间会发白的颜色', `${selector} { ${match[0]} }`);
      }
    }
  }

  return issues;
}

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function checkDarkGlow() {
  const files = await collectSourceFiles(SOURCE_DIR);
  const issues = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    issues.push(...lintDarkGlow(source, path.relative(ROOT, file)));
  }
  return issues;
}

async function main() {
  const issues = await checkDarkGlow();
  if (!issues.length) {
    console.log('[HOMURA] 夜间泛光检查通过');
    return;
  }

  console.error('\n[HOMURA] 夜间泛光检查未通过：');
  for (const issue of issues) {
    console.error(`  ${issue.file}:${issue.line}  ${issue.rule}`);
    console.error(`    ${issue.snippet}`);
  }
  console.error('\n投影、柔光与遮罩请使用 var(--md-shadow-color)，不要使用 var(--md-on-surface) / var(--md-on-surface-variant)。\n');
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch(err => {
    console.error('[HOMURA] 夜间泛光检查失败：', err);
    process.exitCode = 1;
  });
}
