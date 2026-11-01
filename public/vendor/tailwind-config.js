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

    tailwind.config = {
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
    }
