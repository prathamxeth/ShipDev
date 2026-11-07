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
          base: "#050505",
          panel: "#080808",
          surface: "#0e0e0e",
          elevated: "#121212",
          hover: "#181818",
          border: "#1e1e1e",
          "border-subtle": "#161616",
          "border-focus": "#262626",
          hairline: "#262626",
        },
        cursor: {
          orange: "#f54e00",
          "orange-hover": "#ff6a26",
          "orange-active": "#d04200",
          ink: "#26251e",
          body: "#5a5852",
          muted: "#807d72",
        },
        brand: {
          primary: "#f54e00",
          accent: "#f54e00",
          success: "#10b981",
          warning: "#f59e0b",
          danger: "#f43f5e",
          purple: "#a855f7",
          blue: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        "oled-glow": "0 0 20px -5px rgba(245, 78, 0, 0.15)",
        "card-subtle": "0 1px 2px 0 rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
