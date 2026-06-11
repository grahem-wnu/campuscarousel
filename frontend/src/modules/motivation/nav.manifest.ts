// Nav + route registration for the Motivation living document. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'motivation',
    label: 'Why This Path',
    group: 'primary',
    order: 30,
    route: '/motivations',
    icon: 'heart',
    element: () => import('./MotivationPage'),
  },
];
