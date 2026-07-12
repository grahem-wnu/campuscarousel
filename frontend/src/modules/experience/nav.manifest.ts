// Nav + route registration for Experience Hours. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'experience',
    label: 'Experience Hours',
    group: 'secondary',
    order: 45,
    route: '/experience',
    icon: 'clinical',
    element: () => import('./ExperiencePage'),
  },
];
