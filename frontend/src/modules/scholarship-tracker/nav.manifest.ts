// Nav + route registration for the Scholarship Tracker. The shell globs
// frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router from `element`.
// Hidden from the menus per product decision (2026-06-16) — the page is still routable at
// /scholarships, but it no longer surfaces as a primary tab or in the mobile bottom bar.
// Financial Aid (/finaid) is the visible home for budget/aid. To bring it back, drop `hidden`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'scholarships',
    label: 'Scholarships',
    group: 'primary',
    order: 40,
    route: '/scholarships',
    icon: 'scholarship',
    hidden: true,
    element: () => import('./ScholarshipsPage'),
  },
];
