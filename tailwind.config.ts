import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        raised: v("raised"),
        line: v("line"),
        ink: v("ink"),
        soft: v("soft"),
        faint: v("faint"),
        brand: v("brand"),
        "brand-ink": v("brand-ink"),
        "brand-wash": v("brand-wash"),
        warn: v("warn"),
        "warn-wash": v("warn-wash"),
        ask: v("ask"),
        "ask-wash": v("ask-wash"),
        good: v("good"),
        "good-wash": v("good-wash"),
        bad: v("bad"),
        "bad-wash": v("bad-wash"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgb(var(--line) / 0.6), 0 1px 3px rgb(0 0 0 / 0.04)",
        pop: "0 12px 32px -12px rgb(0 0 0 / 0.25)",
      },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        pulseDot: { "0%,100%": { opacity: "0.35" }, "50%": { opacity: "1" } },
      },
      animation: {
        rise: "rise 260ms cubic-bezier(.2,.7,.2,1) both",
        pulseDot: "pulseDot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
