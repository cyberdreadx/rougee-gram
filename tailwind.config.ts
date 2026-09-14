import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Rouge" brand — a crimson accent, the antidote to Meta blue.
        rouge: {
          50: "#fff1f2",
          100: "#ffe0e3",
          200: "#ffc6cd",
          300: "#ff9dab",
          400: "#ff647c",
          500: "#ff2d55",
          600: "#ed1146",
          700: "#c80839",
          800: "#a70b36",
          900: "#8a0e34",
          950: "#4c0117",
        },
        ink: {
          DEFAULT: "#0a0a0b",
          soft: "#141416",
          card: "#1b1b1f",
          border: "#2a2a30",
          muted: "#8a8a94",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
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
        pop: "pop 0.3s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
