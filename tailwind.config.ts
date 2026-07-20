import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#008448",
          dark: "#006d37",
          light: "#dff4e6",
        },
      },
    },
  },
  plugins: [],
};

export default config;
