import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Quantum teal — RougeChain's brand primary (hsl 175 85% 50%). Kept
        // under the `rouge` token name so every existing class re-themes at once.
        // Teal is bright, so solid `rouge-600` surfaces use dark (`text-ink`) text.
        rouge: {
          50: "#e6fffb",
          100: "#b8fff2",
          200: "#7cffe9",
          300: "#34f5da",
          400: "#13ecda",
          500: "#00d2be",
          600: "#06b6a4",
          700: "#0c9184",
          800: "#12736a",
          900: "#145d56",
          950: "#04322e",
        },
        // Quantum purple accent ("quantum pulse", hsl 280 80% 60%).
        accent: {
          DEFAULT: "#a855f7",
          400: "#c084fc",
          500: "#a855f7",
          600: "#9333ea",
        },
        // RougeChain's cool near-black navy surfaces (hsl 220 20-30%).
        ink: {
          DEFAULT: "#0a0c12",
          soft: "#10131c",
          card: "#161b28",
          border: "#262f42",
          muted: "#8b95a7",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "pop": {
          "0%": { transform: "scale(0.8)", opacity: "0.6" },
          "50%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(.16,1,.3,1) both",
        "scale-in": "scale-in 0.2s ease-out both",
        "slide-up": "slide-up 0.3s cubic-bezier(.16,1,.3,1)",
        pop: "pop 0.3s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
