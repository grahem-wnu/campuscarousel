/**
 * Design tokens — the single source of truth for Campus Carousel visual language.
 *
 * Aesthetic: "Field Notes" — a beautifully kept notebook of the journey. Warm paper
 * surfaces, true-ink text, deep evergreen primary, burnished amber accent, and an
 * editorial serif (Fraunces) for titles and big numbers. Warm and personal, never
 * clinical/corporate, never template-generic. Defined once here and consumed by `tailwind.config.ts`; modules use the
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

/** Primary — deep evergreen. The ink-and-forest voice of the Field Notes identity. */
const primary: ColorScale = {
  50: "#eff5f0",
  100: "#d9e8dc",
  200: "#b5d2bd",
  300: "#8ab598",
  400: "#5f9474",
  500: "#3f7a59",
  600: "#2f6349",
  700: "#27553f",
  800: "#1f4634",
  900: "#183628",
};

/** Secondary — burnished amber into terracotta. The warm accent that earns attention. */
const secondary: ColorScale = {
  50: "#fbf4e8",
  100: "#f5e3cb",
  200: "#ebcb9c",
  300: "#dfae6a",
  400: "#d29244",
  500: "#c97b2d",
  600: "#b26124",
  700: "#984a20",
  800: "#7d3b20",
  900: "#66311d",
};

/** Ink — warm paper-and-ink neutrals. 50 is the page ("paper"), 900 is true ink. */
const ink: ColorScale = {
  50: "#fbf7ef",
  100: "#f3ede0",
  200: "#e4dccb",
  300: "#cdc2ab",
  400: "#ac9f85",
  500: "#8a7f6b",
  600: "#6e6454",
  700: "#574f42",
  800: "#3c362c",
  900: "#221d14",
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
  /** Page background — warm paper. */
  base: ink[50],
  /** Cards, panels — cream-white "entry" surface, warmer than pure white. */
  raised: "#fffdf8",
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
  /** Editorial display face — page titles, entry headings, big numbers. Source Serif 4: sturdy
   *  print-grade serif, deliberately free of swashy/cursive quirk. */
  display: ['"Source Serif 4"', "Georgia", "Cambria", '"Times New Roman"', "serif"],
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
  sm: "0 1px 2px 0 rgb(34 29 20 / 0.05)",
  DEFAULT: "0 1px 3px 0 rgb(34 29 20 / 0.07), 0 1px 2px -1px rgb(34 29 20 / 0.07)",
  md: "0 4px 12px -2px rgb(34 29 20 / 0.09)",
  lg: "0 12px 28px -8px rgb(34 29 20 / 0.16)",
  fab: "0 8px 20px -4px rgb(39 85 63 / 0.45)",
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
