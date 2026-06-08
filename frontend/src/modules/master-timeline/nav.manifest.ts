// Nav + route registration for the Master Timeline (a primary tab). The shell globs
// frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'master-timeline',
    label: 'Timeline',
    group: 'primary',
    order: 80,
    route: '/timeline',
    icon: 'calendar',
    element: () => import('./TimelinePage'),
  },
];
