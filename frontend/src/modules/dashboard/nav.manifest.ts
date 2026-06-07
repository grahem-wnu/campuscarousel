// Nav + route registration for the Dashboard — the app's home (primary tab, order 10). The shell
// globs frontend/src/modules/*/nav.manifest.ts, assembles the menus, and builds the router.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    group: 'primary',
    order: 10,
    route: '/dashboard',
    icon: 'home',
    element: () => import('./DashboardPage'),
  },
];
