// Nav + route registration for Course Planner. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'course-planner',
    label: 'Courses',
    // 'secondary': the design system fixes the 5 primary tabs (Dashboard/Journal/Colleges/
    // Scholarships/Timeline); Course Planner lives in the secondary menu (see design-system.md).
    group: 'secondary',
    order: 40,
    route: '/courses',
    icon: 'course',
    element: () => import('./CoursePlannerPage'),
  },
];
