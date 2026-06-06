// Nav + route registration for Application Central. The shell globs
// frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'application-central',
    label: 'Applications',
    group: 'primary',
    order: 40,
    route: '/applications',
    icon: 'application',
    element: () => import('./ApplicationCentralPage'),
  },
];
