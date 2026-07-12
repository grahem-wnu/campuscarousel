import type { SVGProps } from "react";

/**
 * Inline SVG icon set (no icon-library dependency). 24×24, `currentColor` stroke so
 * icons inherit text color. Nav manifests reference icons by {@link IconName}; the
 * shell and primitives render <Icon name=... />. Add new glyphs here as modules need
 * them — this is shared/design-system territory.
 */
export type IconName =
  | "home"
  | "book"
  | "school"
  | "scholarship"
  | "calendar"
  | "goal"
  | "course"
  | "teas"
  | "clinical"
  | "certificate"
  | "heart"
  | "contacts"
  | "interview"
  | "application"
  | "chat"
  | "plus"
  | "menu"
  | "close"
  | "chevron-down"
  | "chevron-right"
  | "star"
  | "star-filled"
  | "search"
  | "check"
  | "copy"
  | "user"
  | "logout"
  | "warning"
  | "info";

const PATHS: Record<IconName, string> = {
  home: "M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9",
  book: "M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2zM5 20a2 2 0 0 1 2-2h11",
  school: "M12 4 2 9l10 5 10-5zM6 11v5c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-5",
  scholarship: "M12 3 2 8l10 5 10-5zM7 10.5V15c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5M21 8v5",
  calendar: "M7 3v3m10-3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  goal: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
  course: "M4 5h16v12H4zM4 21h16M9 9h6M9 13h6",
  teas: "M9 3v5l-4 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-4-9V3M8 3h8M6 14h12",
  clinical: "M12 4v16M4 12h16M8 8h8v8H8z",
  certificate: "M12 3 4 6v5c0 4 3.5 7 8 8 4.5-1 8-4 8-8V6zM9 11l2 2 4-4",
  heart: "M12 20s-7-4.3-9.3-8.5C1 8 3 4.5 6.5 4.5c2 0 3.2 1.2 5.5 3.5 2.3-2.3 3.5-3.5 5.5-3.5C21 4.5 23 8 21.3 11.5 19 15.7 12 20 12 20z",
  contacts: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0",
  interview: "M4 5h16v10H9l-5 4zM8 9h8M8 12h5",
  application: "M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6",
  chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  plus: "M12 5v14M5 12h14",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-right": "M9 6l6 6-6 6",
  star: "M12 4l2.5 5.2 5.7.8-4.1 4 1 5.7L12 17l-5.1 2.7 1-5.7-4.1-4 5.7-.8z",
  "star-filled": "M12 4l2.5 5.2 5.7.8-4.1 4 1 5.7L12 17l-5.1 2.7 1-5.7-4.1-4 5.7-.8z",
  search: "M11 11m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0M21 21l-5-5",
  check: "M5 12l5 5L20 7",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
  logout: "M15 12H4m0 0 4-4m-4 4 4 4M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4",
  warning: "M12 4 2 20h20zM12 10v5M12 17.5v.5",
  info: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 8h.01M11 12h1v4h1",
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Pixel size (width and height). Default 20. */
  size?: number;
  /** Fill the glyph instead of stroking it (e.g. a selected star). */
  filled?: boolean;
}

export function Icon({ name, size = 20, filled, className, ...rest }: IconProps) {
  const path = PATHS[name] ?? PATHS.info;
  const useFill = filled || name === "star-filled";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={useFill ? "currentColor" : "none"}
      stroke={useFill ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={path} />
    </svg>
  );
}

/** True when a string is a known icon name (used by the nav assembler to validate). */
export function isIconName(value: string): value is IconName {
  return value in PATHS;
}
