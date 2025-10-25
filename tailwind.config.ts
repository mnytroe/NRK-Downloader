// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1200px' }
    },
    extend: {
      colors: {
        // Justér brand til det du vil – holder høy kontrast i både light/dark.
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1', // primær
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        }
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px'
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,.06)',
        hover: '0 12px 40px rgba(0,0,0,.10)'
      },
      backgroundImage: {
        // subtilt mønster for hero/bakgrunn
        'radial-soft': 'radial-gradient(40rem 40rem at 10% 10%, rgba(99,102,241,.08), transparent), radial-gradient(40rem 40rem at 90% 30%, rgba(99,102,241,.06), transparent)'
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': { '0%': { transform: 'translateY(6px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in .35s ease-out both',
        'slide-up': 'slide-up .35s ease-out both',
      },
    },
  },
  plugins: [
    // valgfritt, men gir penere inputs/typografi out-of-the-box:
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}

export default config

