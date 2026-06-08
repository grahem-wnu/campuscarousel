// Nav + route registration for the Contacts & Demonstrated Interest hub. The shell globs
// frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router from `element`.
// The per-college TouchpointsPanel is exported for college-hub to mount in its detail tab; it
// consumes this module's public endpoints.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'contacts',
    label: 'Contacts',
    group: 'secondary',
    order: 70,
    route: '/contacts',
    icon: 'contacts',
    element: () => import('./DemonstratedInterestPage'),
  },
];
