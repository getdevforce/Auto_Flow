/** @type {import('tailwindcss').Config} */
export default {
  content: ['./entrypoints/**/*.{html,tsx,ts}', './src/**/*.{tsx,ts}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--c-bg)', surface: 'var(--c-surface)', raised: 'var(--c-raised)', line: 'var(--c-line)',
        ink: 'var(--c-ink)', muted: 'var(--c-muted)', accent: 'var(--c-accent)', 'accent-ink': 'var(--c-accent-ink)',
        danger: 'var(--c-danger)', warn: 'var(--c-warn)', ok: 'var(--c-ok)',
      },
      fontFamily: { sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
      borderRadius: { sm: '4px', md: '6px', lg: '10px' },
      transitionDuration: { fast: '120ms', base: '160ms' },
    },
  },
};
