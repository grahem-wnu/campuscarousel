// Nav + route registration for TEAS Prep. The shell globs frontend/src/modules/*/nav.manifest.ts,
// assembles the menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'teas-prep',
    label: 'TEAS Prep',
    group: 'secondary',
    order: 60,
    route: '/teas',
    icon: 'teas',
    element: () => import('./TeasPage'),
  },
];
