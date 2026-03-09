/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest:  { DEFAULT: '#1a3028', light: '#254538', dark: '#0f1e18' },
        cream:   { DEFAULT: '#f5efe6', dark: '#e8ddd0' },
        gold:    { DEFAULT: '#c9a84c', light: '#e0c070', dark: '#a07830' },
        muted:   '#8a9e94',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
