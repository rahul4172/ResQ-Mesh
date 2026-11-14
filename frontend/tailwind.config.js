/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          app: '#080B0F',
          panel: '#10161B',
          'panel-raised': '#151D23',
          'panel-muted': '#0C1217',
        },
        border: {
          subtle: '#26343A',
          active: '#1D8F82',
        },
        tactext: {
          primary: '#DCE7E8',
          secondary: '#8B9A9E',
          muted: '#58666B',
        },
        accent: {
          cyan: '#48D8D0',
          teal: '#19A88F',
          blue: '#4B91E8',
        },
        status: {
          success: '#35C98A',
          warning: '#E6B84D',
          critical: '#F06464',
          neutral: '#87949A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'Courier New', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem', // 10px
        '3xs': '0.5625rem', // 9px
      },
      letterSpacing: {
        tactical: '0.1em',
        widest: '0.15em',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar': 'radar 2.5s ease-out infinite',
      },
      keyframes: {
        radar: {
          '0%': { transform: 'scale(1)', opacity: '0.9' },
          '100%': { transform: 'scale(3.2)', opacity: '0' },
        }
      }
    },
  },
  plugins: [],
}
