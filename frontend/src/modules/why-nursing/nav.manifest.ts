// Nav + route registration for the "Why Nursing" living document. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'why-nursing',
    label: 'Why This Path',
    group: 'primary',
    order: 30,
    route: '/why-nursing',
    icon: 'heart',
    element: () => import('./WhyNursingPage'),
  },
];
