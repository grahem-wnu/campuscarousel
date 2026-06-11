/**
 * Design tokens — the single source of truth for Campus Carousel visual language.
 *
 * Aesthetic (master spec §"Design Notes"): warm, approachable, aspirational — not
 * clinical/corporate. Soft blue-green primary + warm sand secondary on a warm-neutral
 * scale. Defined once here and consumed by `tailwind.config.ts`; modules use the
 * generated token classes (e.g. `bg-primary-500`, `text-ink-700`), never raw hex.
 *
 * Dark-mode-ready: colors are organized as numbered scales so a dark theme can remap
 * them later without touching module code. Light ships first.
 */

/** A 50→900 color scale. */
export type ColorScale = {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
};

/** Primary — a calm teal/blue-green. Aspirational, not sterile. */
const primary: ColorScale = {
  50: "#eefcfb",
  100: "#d3f6f3",
  200: "#abece8",
  300: "#74ddd8",
  400: "#3cc4c1",
  500: "#1fa8a6",
  600: "#15868a",
  700: "#156a6f",
  800: "#15565a",
  900: "#15484c",
};

/** Secondary — warm sand/terracotta. The "earth tone" warmth from the spec. */
const secondary: ColorScale = {
  50: "#fdf6ef",
  100: "#f9e7d4",
  200: "#f2cca8",
  300: "#e9aa72",
  400: "#e08947",
  500: "#d86f2c",
  600: "#c75721",
  700: "#a5421f",
  800: "#843620",
  900: "#6c2f1d",
};

/** Ink — warm neutral scale for text, borders, surfaces (not a cold gray). */
const ink: ColorScale = {
  50: "#f8f7f4",
  100: "#efede7",
  200: "#ddd9cf",
  300: "#c3bdae",
  400: "#a39a86",
  500: "#857c68",
  600: "#6b6353",
  700: "#564f43",
  800: "#3b372f",
  900: "#26231e",
};

/** Semantic accents. Used for badges, status, deadlines (spec uses red/yellow/green coding). */
const success: ColorScale = {
  50: "#eef9f1",
  100: "#d4f0db",
  200: "#a9e0b9",
  300: "#74c98e",
  400: "#46ad67",
  500: "#2b9150",
  600: "#1f7440",
  700: "#1c5c35",
  800: "#19492c",
  900: "#153c25",
};

const warn: ColorScale = {
  50: "#fef8ec",
  100: "#fbecc8",
  200: "#f7d98c",
  300: "#f2bf4c",
  400: "#eca722",
  500: "#d98a13",
  600: "#bb6810",
  700: "#954b12",
  800: "#7a3c14",
  900: "#653214",
};

const error: ColorScale = {
  50: "#fef2f2",
  100: "#fde0df",
  200: "#fbc6c4",
  300: "#f59e9b",
  400: "#ec6b67",
  500: "#dd4440",
  600: "#c52a27",
  700: "#a51f1d",
  800: "#881d1c",
  900: "#711d1d",
};

/** Application surfaces, mapped from the scales above so dark mode can remap centrally. */
const surface = {
  /** Page background. */
  base: ink[50],
  /** Cards, panels. */
  raised: "#ffffff",
  /** Subtle fills (table stripes, hover). */
  sunken: ink[100],
  /** Hairline borders. */
  border: ink[200],
};

export const colors = {
  primary,
  secondary,
  ink,
  success,
  warn,
  error,
  surface,
} as const;

/**
 * Type scale — clean sans-serif, mobile-first readability. rem-based so it respects
 * the user's root font size. `[fontSize, lineHeight]` pairs match Tailwind's shape.
 */
export const fontFamily = {
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
} as const;

export const fontSize = {
  xs: ["0.75rem", "1rem"],
  sm: ["0.875rem", "1.25rem"],
  base: ["1rem", "1.5rem"],
  lg: ["1.125rem", "1.75rem"],
  xl: ["1.25rem", "1.75rem"],
  "2xl": ["1.5rem", "2rem"],
  "3xl": ["1.875rem", "2.25rem"],
  "4xl": ["2.25rem", "2.5rem"],
} as const;

/** Spacing scale (rem). Tailwind's defaults are fine; we add a few app rhythm steps. */
export const spacing = {
  px: "1px",
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  /** App shell rhythm. */
  "nav-h": "3.5rem",
  "bottombar-h": "4rem",
} as const;

/** Corner radii — soft, friendly. */
export const borderRadius = {
  none: "0",
  sm: "0.25rem",
  DEFAULT: "0.5rem",
  md: "0.625rem",
  lg: "0.875rem",
  xl: "1.25rem",
  "2xl": "1.75rem",
  full: "9999px",
} as const;

/** Shadows — gentle elevation, never harsh. */
export const boxShadow = {
  none: "none",
  sm: "0 1px 2px 0 rgb(38 35 30 / 0.05)",
  DEFAULT: "0 1px 3px 0 rgb(38 35 30 / 0.08), 0 1px 2px -1px rgb(38 35 30 / 0.08)",
  md: "0 4px 12px -2px rgb(38 35 30 / 0.10)",
  lg: "0 12px 28px -8px rgb(38 35 30 / 0.18)",
  fab: "0 8px 20px -4px rgb(21 134 138 / 0.45)",
} as const;

/** z-index ladder for the shell so overlays compose predictably. */
export const zIndex = {
  base: "0",
  nav: "30",
  bottombar: "30",
  fab: "35",
  overlay: "40",
  slideover: "45",
  modal: "50",
  toast: "60",
} as const;

/** The complete token bundle (handy for tests and tailwind consumption). */
export const tokens = {
  colors,
  fontFamily,
  fontSize,
  spacing,
  borderRadius,
  boxShadow,
  zIndex,
} as const;

export type Tokens = typeof tokens;
