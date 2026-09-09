/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.js",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        gray: {
          50: "#F4F7F3",
          100: "#E5ECE4",
          200: "#D4DFD3",
          300: "#B9C8B8",
          400: "#819080",
          500: "#627060",
          600: "#4B584A",
          700: "#374236",
          800: "#273126",
          900: "#192219",
        },
        farm: {
          50: "#EEF7F0",
          100: "#DCEFE1",
          200: "#C1E1CA",
          300: "#98CBAB",
          400: "#69AB81",
          500: "#428D63",
          600: "#2D7A55",
          700: "#246544",
          800: "#1E5138",
          900: "#173E2C",
          950: "#0D291C",
        },
      },
    },
  },
  plugins: [],
};
