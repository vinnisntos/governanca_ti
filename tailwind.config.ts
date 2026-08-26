import type { Config } from "tailwindcss";

// Paleta alinhada à identidade visual da Going2 (going2.com.br): verde vívido
// de marca (#64DC00) na posição 600, com tons mais escuros da mesma matiz nas
// posições 700+ para uso legível como texto/ícone sobre fundo claro.
const primary = {
  50: "#f6fdea",
  100: "#e9f9cb",
  200: "#d4f29c",
  300: "#b6e662",
  400: "#98d934",
  500: "#7de60f",
  600: "#64dc00",
  700: "#3d8300",
  800: "#2f6600",
  900: "#264f0a",
  950: "#122b02",
};

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary,
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
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
