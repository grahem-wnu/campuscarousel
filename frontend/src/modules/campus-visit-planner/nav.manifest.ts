// Nav + route registration for Campus Visit Planner. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`. 'secondary' group — the 5 primary tabs are fixed by
// the design system (Dashboard/Journal/Colleges/Scholarships/Timeline).

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'campus-visit-planner',
    label: 'Campus Visits',
    group: 'secondary',
    order: 50,
    route: '/visits',
    icon: 'calendar',
    element: () => import('./VisitPlannerPage'),
  },
];
