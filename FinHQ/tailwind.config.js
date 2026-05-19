/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          950: '#051A0E',
          900: '#0D3B2A',
          800: '#164D38',
          700: '#1B5E3B',
          600: '#2D7A50',
          500: '#3D9162',
          400: '#52B788',
          300: '#74C69D',
          200: '#99D6B4',
          100: '#D1ECE0',
          50:  '#F0F7F4',
        },
        cream: {
          DEFAULT: '#FAFCF8',
          warm:    '#FDF8F0',
          100:     '#F2EDE3',
        },
        gold: {
          DEFAULT: '#C8963E',
          light:   '#E4B96A',
          dark:    '#9E7232',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:  '0 1px 4px 0 rgba(13,59,42,0.08), 0 0 0 1px rgba(13,59,42,0.04)',
        modal: '0 24px 64px -12px rgba(13,59,42,0.25)',
      },
    },
  },
  plugins: [],
}
