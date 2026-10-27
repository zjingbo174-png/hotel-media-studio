/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f3ec',
        card: '#fffdf9',
        ink: {
          DEFAULT: '#23201c',
          soft: '#4a443c',
          mute: '#8c8477',
        },
        clay: {
          50: '#fdf1ec',
          100: '#fadfd3',
          200: '#f4bda6',
          300: '#ec9374',
          400: '#e26f4c',
          500: '#e0573b',
          600: '#c8432b',
          700: '#a43423',
        },
        jade: {
          50: '#eef5f1',
          500: '#3f7a5e',
          600: '#33634c',
        },
        line: '#e9e2d6',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(35,32,28,.04), 0 8px 24px -12px rgba(35,32,28,.16)',
        float: '0 12px 32px -12px rgba(35,32,28,.28)',
      },
      keyframes: {
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(.92)' },
          '60%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'rise-in': 'rise-in .28s ease-out both',
        'sheet-up': 'sheet-up .26s cubic-bezier(.22,1,.36,1) both',
        pop: 'pop .24s ease-out both',
      },
    },
  },
  plugins: [],
};
