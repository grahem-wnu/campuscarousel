// Nav + route registration for Application Central. The shell globs
// frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router from `element`.
// Secondary nav: the design-system spec fixes the 5 PRIMARY tabs (Dashboard, Journal, Colleges,
// Scholarships, Timeline); Applications lives in the secondary menu (a 6th primary tab would overflow
// the mobile bottom bar and collide at order:40 with Scholarships).

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'application-central',
    label: 'Applications',
    group: 'secondary',
    order: 70,
    route: '/applications',
    icon: 'application',
    element: () => import('./ApplicationCentralPage'),
  },
];
