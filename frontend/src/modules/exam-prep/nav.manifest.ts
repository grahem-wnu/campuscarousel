// Nav + route registration for Exam Prep. The shell globs frontend/src/modules/*/nav.manifest.ts,
// assembles the menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'exam-prep',
    label: 'Test Prep',
    group: 'secondary',
    order: 60,
    route: '/exams',
    icon: 'teas',
    element: () => import('./ExamPrepPage'),
  },
];
