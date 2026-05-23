/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef4ff',
          100: '#d9e6ff',
          200: '#b6cdff',
          400: '#5b86ff',
          500: '#3068ff',
          600: '#1f4ce6',
          700: '#1a3fbf',
          900: '#1a2f80',
        },
      },
    },
  },
  plugins: [],
};
