/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0e0f11',
          900: '#131417',
          850: '#17181c',
          800: '#1c1d22',
          750: '#22242a',
          700: '#2a2c33',
          600: '#373a43',
          500: '#4a4e59',
        },
        paper: { DEFAULT: '#ecebe8', dim: '#a9abb1', mute: '#7c7f88' },
        accent: { DEFAULT: '#4d8dff', hi: '#79a9ff', lo: '#2f6fe0', glow: 'rgba(77,141,255,0.18)' },
        kind: { original: '#ecebe8', ai: '#a78bfa', rig: '#38c9b0', inbetween: '#f2b552', drawn: '#9aa0aa', coin: '#e8c46a' },
        danger: '#ff6b6b',
        ok: '#4cd59a',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: { '2xs': ['10.5px', '14px'] },
      boxShadow: { panel: '0 8px 30px rgba(0,0,0,0.45)', focus: '0 0 0 2px rgba(77,141,255,0.55)' },
    },
  },
  plugins: [],
};
