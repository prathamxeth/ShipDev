import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        oled: {
          black: "#000000",
          base: "#08080a",
          panel: "#0f0f13",
          surface: "#141418",
          elevated: "#1a1a20",
          hover: "#22222a",
          border: "#1f2028",
          "border-subtle": "#16171d",
          "border-focus": "#383a48",
        },
        brand: {
          primary: "#3b82f6",
          accent: "#6366f1",
          success: "#10b981",
          warning: "#f59e0b",
          danger: "#f43f5e",
          purple: "#8b5cf6",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        "oled-glow": "0 0 20px -5px rgba(59, 130, 246, 0.15)",
        "card-subtle": "0 1px 2px 0 rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};

export default config;

