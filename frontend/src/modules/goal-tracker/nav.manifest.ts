// Nav + route registration for the Goal Tracker. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    // Secondary nav: the design-system spec fixes the 5 primary tabs (Dashboard, Journal, Colleges,
    // Scholarships, Timeline); everything else lives in the secondary dropdown/overflow.
    id: 'goals',
    label: 'Goals',
    group: 'secondary',
    order: 30,
    route: '/goals',
    icon: 'goal',
    element: () => import('./GoalsPage'),
  },
];
