import type { ComponentType } from "react";
import type { IconName } from "../ui/Icon";

/** App roles (mirror of the backend `custom:role` claim). `parent` = managing guardian, `member` =
 *  view-only supporter (grandparent, counselor, family friend). */
export type Role = "admin" | "parent" | "student" | "member";

/** Where a nav entry appears in the shell. */
export type NavGroup = "primary" | "secondary";

/**
 * A single navigation + route registration. Each module ships
 * `frontend/src/modules/<m>/nav.manifest.ts` exporting `nav: NavEntry[]`. The shell
 * globs these (no shared nav file to merge-conflict on), assembles the menus, and
 * builds the router from them.
 *
 * @example
 * import type { NavEntry } from "../../shared/shell/types";
 * export const nav: NavEntry[] = [{
 *   id: "journal", label: "Journal", group: "primary", order: 20,
 *   route: "/journal", icon: "book", element: () => import("./JournalPage"),
 * }];
 */
export interface NavEntry {
  /** Stable unique id (also used as React key). */
  id: string;
  label: string;
  group: NavGroup;
  /** Sort order within the group (lower = earlier). */
  order: number;
  /** Route path, e.g. "/journal" or "/colleges/:id". Must be a string literal. */
  route: string;
  /** Icon name from the shared set (falls back to a generic glyph if unknown). */
  icon: IconName | string;
  /** Lazy page component (default export). */
  element: () => Promise<{ default: ComponentType }>;
  /** Roles allowed to see this entry. Omit = visible to all roles. */
  roles?: Role[];
  /** Hide from the menus but still register the route (e.g. detail pages). */
  hidden?: boolean;
  /** Platform super-admin only (Grahem). Hidden from the menu AND the router for everyone else. */
  platformAdmin?: boolean;
}

/** Result of assembling all module manifests. */
export interface AssembledNav {
  /** Primary tabs (top bar + mobile bottom bar), role-filtered, sorted. */
  primary: NavEntry[];
  /** Secondary menu entries (overflow dropdown / hamburger), role-filtered, sorted. */
  secondary: NavEntry[];
  /** Every routable entry (incl. hidden), role-filtered — used to build the router. */
  routes: NavEntry[];
}
