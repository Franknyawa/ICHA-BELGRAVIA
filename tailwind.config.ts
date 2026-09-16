import type { Config } from "tailwindcss";

function withOpacity(varName: string) {
  return `rgb(var(${varName}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: withOpacity("--color-ink"),
        "ink-muted": withOpacity("--color-ink-muted"),
        bg: withOpacity("--color-bg"),
        "bg-elevated": withOpacity("--color-bg-elevated"),
        "bg-card": withOpacity("--color-bg-card"),
        line: withOpacity("--color-line"),
        brass: {
          DEFAULT: withOpacity("--color-brass"),
          soft: withOpacity("--color-brass-soft"),
          dim: withOpacity("--color-brass-dim"),
        },
        ok: withOpacity("--color-ok"),
        warn: withOpacity("--color-warn"),
        danger: withOpacity("--color-danger"),
      },
      fontFamily: {
        display: ["var(--font-cormorant)", "serif"],
        sans: ["var(--font-jost)", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
