/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#F7F7F8',
        primary: '#0B1F3A',
        'primary-hover': '#162B4A',
        accent: '#C9A646',
        'accent-hover': '#B5933D',
        'text-primary': '#111827',
        'text-secondary': '#6B7280',
        'text-muted': '#9CA3AF',
        border: '#E5E7EB',
        'border-light': '#F3F4F6',
        card: '#FFFFFF',
        petitioner: '#059669',
        'petitioner-dark': '#065F46',
        respondent: '#DC2626',
        'respondent-dark': '#991B1B',
      },
      fontFamily: {
        serif: ['Playfair Display', 'Merriweather', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        elevated: '0 4px 12px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.03)',
        modal: '0 8px 30px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.04)',
        focus: '0 0 0 3px rgba(201, 166, 70, 0.25)',
      },
      borderRadius: {
        card: '16px',
        button: '8px',
      },
      maxWidth: {
        container: '1200px',
      },
      transitionDuration: {
        'fast': '150ms',
        'base': '200ms',
        'slow': '250ms',
      },
      animation: {
        'shimmer': 'shimmer 1.5s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
