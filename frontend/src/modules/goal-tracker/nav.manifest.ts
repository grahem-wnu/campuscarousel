// Nav + route registration for the Goal Tracker. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'goals',
    label: 'Goals',
    group: 'primary',
    order: 30,
    route: '/goals',
    icon: 'goal',
    element: () => import('./GoalsPage'),
  },
];
