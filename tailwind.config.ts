import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta "deck de grabación": carcasa oscura + testigo ámbar/rojo VU.
        deck: {
          950: '#0e0c0a',
          900: '#161310',
          800: '#201c18',
          700: '#2c2621',
          600: '#3a322b',
          500: '#4d423a'
        },
        amber: {
          400: '#ffcf6b',
          500: '#ffb020',
          600: '#e0910a'
        },
        rec: {
          500: '#ff4d4d',
          600: '#e23434'
        },
        paper: '#f3efe6'
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        panel: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.45)'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        blink: 'blink 1.2s step-start infinite'
      }
    }
  },
  plugins: []
}

export default config
