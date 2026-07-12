import type { Config } from "tailwindcss";
import {
  colors,
  fontFamily,
  fontSize,
  spacing,
  borderRadius,
  boxShadow,
  zIndex,
} from "./src/shared/design/tokens";

// Tailwind theme is generated from the design tokens (single source of truth).
// Modules use the resulting utility classes (`bg-primary-500`, `text-ink-700`,
// `rounded-lg`, `shadow-md`) and never raw hex. `darkMode: "class"` keeps us
// dark-mode-ready (light ships first; no dark palette wired yet).
//
// The token objects are declared `as const` (readonly) for safety at their source;
// Tailwind's theme type wants mutable shapes, so we widen them here. The values are
// identical — this cast only relaxes readonly-ness, it changes nothing at runtime.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    fontFamily: {
      sans: [...fontFamily.sans],
      display: [...fontFamily.display],
    },
    extend: {
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
        ink: colors.ink,
        success: colors.success,
        warn: colors.warn,
        error: colors.error,
        surface: colors.surface,
      },
      fontSize: fontSize as unknown as NonNullable<Config["theme"]>["fontSize"],
      spacing: { ...spacing },
      borderRadius: { ...borderRadius },
      boxShadow: { ...boxShadow },
      zIndex: { ...zIndex },
    },
  },
  plugins: [],
};

export default config;
