// Nav + route registration for Application Central (essay workspace). The shell globs
// frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router from `element`.
// Secondary nav: the design-system spec fixes the 5 primary tabs (Dashboard, Journal, Colleges,
// Scholarships, Timeline); the essay workspace lives in the secondary menu.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'essays',
    label: 'Essays',
    group: 'secondary',
    order: 50,
    route: '/essays',
    icon: 'application',
    element: () => import('./EssaysPage'),
  },
];
