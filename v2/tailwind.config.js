/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1C4370', dark: '#142f4f', light: '#2a5a8f' },
        comoe: { DEFAULT: '#22806B', dark: '#1a6355', light: '#2da88e' },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 4px rgba(28,67,112,.08)',
        soft: '0 4px 18px rgba(28,67,112,.10)',
      },
    },
  },
  plugins: [],
}
