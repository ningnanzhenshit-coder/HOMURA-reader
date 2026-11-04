import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDarkGlow, lintDarkGlow } from '../scripts/check-dark-glow.mjs';

test('投影误用 on-surface 会被拦截', () => {
  const issues = lintDarkGlow(
    '.card { box-shadow: 0 2px 8px color-mix(in oklab, var(--md-on-surface) 18%, transparent); }',
    'fixture.css'
  );
  assert.equal(issues.length, 1);
});

test('投影误用 on-surface-variant 也会被拦截', () => {
  const issues = lintDarkGlow(
    '.card { box-shadow: 0 2px 8px color-mix(in oklab, var(--md-on-surface-variant) 18%, transparent); }',
    'fixture.css'
  );
  assert.equal(issues.length, 1);
});

test('夜间阴影 token 与低比例状态层不误报', () => {
  assert.equal(lintDarkGlow(
    '.card { box-shadow: 0 2px 8px color-mix(in oklab, var(--md-shadow-color) 18%, transparent); }',
    'fixture.css'
  ).length, 0);
  assert.equal(lintDarkGlow(
    '.button:hover { background: color-mix(in oklab, var(--md-on-surface) 8%, transparent); }',
    'fixture.css'
  ).length, 0);
});

test('遮罩误用 on-surface 会被拦截', () => {
  const issues = lintDarkGlow(
    '.md-scrim { background: color-mix(in oklab, var(--md-on-surface) 32%, transparent); }',
    'fixture.css'
  );
  assert.equal(issues.length, 1);
});

test('弹层内低比例状态层不误报', () => {
  const issues = lintDarkGlow(
    '.dialog { background: color-mix(in oklab, var(--md-on-surface) 8%, transparent); }',
    'fixture.css'
  );
  assert.equal(issues.length, 0);
});

test('Tailwind 任意投影值也会被检查', () => {
  const issues = lintDarkGlow(
    '<div class="shadow-[0_2px_8px_color-mix(in_oklab,var(--md-on-surface)_18%,transparent)]"></div>',
    'fixture.vue'
  );
  assert.equal(issues.length, 1);
});

test('仓库现有样式通过夜间泛光检查', async () => {
  assert.deepEqual(await checkDarkGlow(), []);
});
