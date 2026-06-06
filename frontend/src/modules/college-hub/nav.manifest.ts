// Nav + route registration for College Hub. The shell globs frontend/src/modules/*/nav.manifest.ts,
// assembles the menus, and builds the router from `element`. Two entries: the visible list and the
// hidden detail route (registered for routing but kept out of the menus).

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'college-hub',
    label: 'Colleges',
    group: 'primary',
    order: 30,
    route: '/colleges',
    icon: 'school',
    element: () => import('./CollegeHubPage'),
  },
  {
    id: 'college-detail',
    label: 'College',
    group: 'secondary',
    order: 99,
    route: '/colleges/:id',
    icon: 'school',
    hidden: true,
    element: () => import('./CollegeDetailPage'),
  },
];
