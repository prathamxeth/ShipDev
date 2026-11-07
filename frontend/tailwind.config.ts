import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        clay: {
          primary: "#0a0a0a",
          "primary-active": "#1f1f1f",
          "primary-disabled": "#e5e5e5",
          ink: "#0a0a0a",
          body: "#3a3a3a",
          "body-strong": "#1a1a1a",
          muted: "#6a6a6a",
          "muted-soft": "#9a9a9a",
          hairline: "#e5e5e5",
          "hairline-soft": "#f0f0f0",
          canvas: "#fffaf0",
          "surface-soft": "#faf5e8",
          "surface-card": "#f5f0e0",
          "surface-strong": "#ebe6d6",
          "surface-dark": "#0a1a1a",
          "surface-dark-elevated": "#1a2a2a",
          pink: "#ff4d8b",
          teal: "#1a3a3a",
          lavender: "#b8a4ed",
          peach: "#ffb084",
          ochre: "#e8b94a",
          mint: "#a4d4c5",
          coral: "#ff6b5a",
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
        },
      },
      borderRadius: {
        "clay-xs": "6px",
        "clay-sm": "8px",
        "clay-md": "12px",
        "clay-lg": "16px",
        "clay-xl": "24px",
        "clay-pill": "9999px",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        "clay-soft": "0 2px 8px -2px rgba(10, 10, 10, 0.05), 0 1px 4px -1px rgba(10, 10, 10, 0.03)",
        "clay-card": "0 4px 16px -4px rgba(10, 10, 10, 0.08), 0 2px 6px -2px rgba(10, 10, 10, 0.04)",
        "clay-elevated": "0 12px 32px -8px rgba(10, 10, 10, 0.12), 0 4px 12px -2px rgba(10, 10, 10, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
