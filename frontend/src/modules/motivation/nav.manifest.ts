// Nav + route registration for the Motivation living document. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'motivation',
    label: 'Why This Path',
    group: 'secondary',
    order: 35,
    route: '/motivations',
    icon: 'heart',
    // Student-only: this is the student's personal motivation/essay space. Gating hides both the menu
    // entry and the route from parents/admins (the backend already enforces per-entry privacy on top).
    roles: ['student'],
    element: () => import('./MotivationPage'),
  },
];
