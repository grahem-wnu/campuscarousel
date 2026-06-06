// Nav + route registration for Course Planner. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'course-planner',
    label: 'Courses',
    group: 'primary',
    order: 40,
    route: '/courses',
    icon: 'course',
    element: () => import('./CoursePlannerPage'),
  },
];
