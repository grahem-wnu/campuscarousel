// Nav + route registration for Reminders (the email digest settings page). The shell globs
// frontend/src/modules/*/nav.manifest.ts and assembles the menus. Visible to all roles.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'reminders',
    label: 'Reminders',
    group: 'secondary',
    order: 95,
    route: '/reminders',
    icon: 'calendar',
    element: () => import('./RemindersPage'),
  },
];
