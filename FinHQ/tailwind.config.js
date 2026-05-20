/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          900: '#0D3B2A',
          800: '#164D38',
          700: '#1B5E3B',
          500: '#3D9162',
          400: '#52B788',
          300: '#74C69D',
          50:  '#F0F7F4',
        },
        cream: '#FAFCF8',
        gold: '#C8963E',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 8px -2px rgba(13,59,42,0.08), 0 0 0 1px rgba(13,59,42,0.03)',
      },
    },
  },
  plugins: [],
}