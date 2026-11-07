/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        bg: '#0B0B0F',
        surface: '#15151B',
        surface2: '#1C1C24',
        blue: { DEFAULT: '#4F8CFF', hover: '#6BA3FF' },
        purple: { DEFAULT: '#8B5CF6' },
        amber: { DEFAULT: '#F59E0B' },
        green: { DEFAULT: '#22C55E' },
        red: { DEFAULT: '#EF4444' },
        t1: '#F0F0F5',
        t2: '#8888A0',
        t3: '#44445A',
        background: '#06080C',
        card: '#171B22',
        border: '#252C35',
        primary: { DEFAULT: '#3DD8FF', foreground: '#06080C' },
        text: { DEFAULT: '#F8F8F8', secondary: '#8E96A5' },
        success: '#3BFF91',
        warning: '#FFB547',
        error: '#FF5959',
        accent: '#9B5CFF',
      },
    },
  },
  plugins: [],
};
