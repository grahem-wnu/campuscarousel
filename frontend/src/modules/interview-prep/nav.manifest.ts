// Nav + route registration for Interview Prep. The shell globs frontend/src/modules/*/nav.manifest.ts,
// assembles the menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'interview-prep',
    label: 'Interview Prep',
    group: 'secondary',
    order: 70,
    route: '/interviews',
    icon: 'interview',
    element: () => import('./InterviewPage'),
  },
];
