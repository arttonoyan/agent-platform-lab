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
        ink: {
          50:  '#f6f8fb',
          100: '#eef1f6',
          200: '#dde3ec',
          900: '#0b1220',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 4px rgba(15, 23, 42, 0.03)',
      },
    },
  },
  plugins: [],
};
