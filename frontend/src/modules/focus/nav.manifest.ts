// Nav + route registration for Focus (the major-pack page). The shell globs
// frontend/src/modules/*/nav.manifest.ts and builds the router from `element`. Primary group, placed
// right after Dashboard so the student's major focus is a prominent, obvious destination.

import type { NavEntry } from "../../shared/shell";

export const nav: NavEntry[] = [
  {
    id: "focus",
    label: "Focus",
    group: "primary",
    order: 15,
    route: "/focus",
    icon: "star",
    element: () => import("./FocusPage"),
  },
];
