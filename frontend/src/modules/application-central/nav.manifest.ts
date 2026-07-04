// Nav + route registration for Application Central. The shell globs
// frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router from `element`.
// PRIMARY tab (order 35): essay writing is the app's end goal, so managing essays/applications is
// one tap away in the mobile bottom bar — Dashboard(10), Focus(15), Journal(20), Colleges(30),
// Applications(35). Scholarships(40) and Timeline(80) overflow to the More menu / drawer.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'application-central',
    label: 'Applications',
    group: 'primary',
    order: 35,
    route: '/applications',
    icon: 'application',
    element: () => import('./ApplicationCentralPage'),
  },
];
