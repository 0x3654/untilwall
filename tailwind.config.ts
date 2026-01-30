import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Life Calendar color palette
        lc: {
          bg: "#FAFAFA",
          "bg-dark": "#1a1a1a",
          empty: "#E5E5E5",
          "empty-dark": "#2a2a2a",
          filled: "#ffffff",
          "filled-dark": "#ffffff",
          current: "#ff6b35",
          "text-orange": "#ff6b35",
          "percent-gray": "#666666",
        },
      },
    },
  },
  plugins: [],
};
export default config;
