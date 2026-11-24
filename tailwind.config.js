/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1729',
        navy: '#101a33',
        mint: '#12b886',
        coral: '#ff6b5a',
        sand: '#f6f7fb',
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Noto Sans CJK KR',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(15, 23, 41, 0.25)',
        soft: '0 2px 10px -4px rgba(15, 23, 41, 0.12)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { rise: 'rise .28s ease-out both' },
    },
  },
  plugins: [],
};
