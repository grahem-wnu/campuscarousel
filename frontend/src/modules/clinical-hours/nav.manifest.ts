// Nav + route registration for Clinical Hours. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'clinical-hours',
    label: 'Clinical Hours',
    group: 'primary',
    order: 30,
    route: '/clinical',
    icon: 'clinical',
    element: () => import('./ClinicalPage'),
  },
];
