/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // Semantic design tokens — RGB triplets so alpha modifiers work
      // (bg-app/80). Values flip via CSS vars in globals.css (.dark).
      colors: {
        app: "rgb(var(--c-app) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        raise: "rgb(var(--c-raise) / <alpha-value>)",
        hover: "rgb(var(--c-hover) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        lineStrong: "rgb(var(--c-line-strong) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        dim: "rgb(var(--c-dim) / <alpha-value>)",
        faint: "rgb(var(--c-faint) / <alpha-value>)",
        caption: "rgb(var(--c-caption) / <alpha-value>)"
      },
      // Enterprise scale: consistent radii
      borderRadius: { DEFAULT: "0.5rem", lg: "0.75rem", xl: "1rem" }
    }
  },
  plugins: []
};
