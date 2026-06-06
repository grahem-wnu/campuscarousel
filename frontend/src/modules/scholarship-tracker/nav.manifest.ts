// Nav + route registration for the Scholarship Tracker. The shell globs
// frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router from `element`.
// Scholarships is one of the design-system's 5 fixed PRIMARY tabs.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'scholarships',
    label: 'Scholarships',
    group: 'primary',
    order: 40,
    route: '/scholarships',
    icon: 'scholarship',
    element: () => import('./ScholarshipsPage'),
  },
];
