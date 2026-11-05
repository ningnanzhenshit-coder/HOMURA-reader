// 构建期 Tailwind 配置。开发环境仍用 public/vendor 的运行时版本热更新，
// 生产构建由 vite.config.js 的 homura-tailwind-static 插件产出静态 CSS。
const systemSans = [
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  'sans-serif'
];

export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: systemSans,
        display: systemSans,
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      }
    }
  }
};
