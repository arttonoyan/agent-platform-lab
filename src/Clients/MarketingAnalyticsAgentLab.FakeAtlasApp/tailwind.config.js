/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        atlas: {
          50:  '#f0fbff',
          100: '#dcf3ff',
          400: '#3aa7f0',
          500: '#1f8de0',
          600: '#0e74c4',
          700: '#0a5ea1',
          900: '#053a66',
        },
      },
    },
  },
  plugins: [],
};
