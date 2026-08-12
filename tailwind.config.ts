import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: colors.indigo,
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        popover: "0 8px 24px -4px rgb(15 23 42 / 0.15), 0 2px 8px -2px rgb(15 23 42 / 0.08)",
      },
      keyframes: {
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "content-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "overlay-in": "overlay-in 150ms ease-out",
        "content-in": "content-in 150ms ease-out",
        "toast-in": "toast-in 150ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
