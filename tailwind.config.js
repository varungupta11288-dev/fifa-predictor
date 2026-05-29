module.exports = {
  content: ['./src/**/*.{njk,html,md,js}'],
  theme: {
    extend: {
      colors: {
        // Pitch / broadcast greens
        pitch: {
          50:  '#e6f4ec',
          100: '#c2e3cd',
          200: '#94cba9',
          300: '#5fae82',
          400: '#2f9261',
          500: '#0b6b3a',
          600: '#085530',
          700: '#06432a',
          800: '#053522',
          900: '#03241a',
        },
        // Trophy / champion gold
        champ: {
          300: '#fde68a',
          400: '#fcd34d',
          500: '#eab308',
          600: '#b08323',
          700: '#7a5a13',
        },
        bronze: '#cd7f32',
        silver: '#c0c0c0',
        // WC2026 host-country flag accents
        host: {
          usaRed:   '#c8102e',
          usaBlue:  '#3c3b6e',
          mexGreen: '#006847',
          mexRed:   '#ce1126',
        },
      },
      fontFamily: {
        display: [
          'system-ui', '-apple-system', 'BlinkMacSystemFont',
          '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif',
        ],
      },
      keyframes: {
        goldGlow: {
          '0%,100%': { boxShadow: '0 0 12px 0 rgba(252, 211, 77, 0.35)' },
          '50%':     { boxShadow: '0 0 28px 6px rgba(252, 211, 77, 0.65)' },
        },
        goldShimmer: {
          '0%':   { backgroundPosition: '200% 50%' },
          '100%': { backgroundPosition: '-200% 50%' },
        },
        pitchPan: {
          '0%':   { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '200px 0' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%':     { opacity: '0.55', transform: 'scale(1.25)' },
        },
        barFill: {
          '0%':   { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        flagSweep: {
          '0%':   { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '100% 0%' },
        },
        flagText: {
          '0%':   { transform: 'translateX(-10%)' },
          '100%': { transform: 'translateX(10%)' },
        },
      },
      animation: {
        goldGlow:    'goldGlow 3.5s ease-in-out infinite',
        goldShimmer: 'goldShimmer 4s linear infinite',
        pitchPan:    'pitchPan 18s linear infinite',
        pulseDot:    'pulseDot 1.6s ease-in-out infinite',
        barFill:     'barFill 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
        flagSweep:   'flagSweep 14s ease-in-out infinite alternate',
        flagText:    'flagText 14s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [],
};
