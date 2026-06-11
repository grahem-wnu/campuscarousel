// Nav + route registration for Family management (multi-student per family). Parents/admins manage the
// children in the family (the roster behind the student switcher); hidden from the student role.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'family',
    label: 'Family',
    group: 'secondary',
    order: 95,
    route: '/family',
    icon: 'contacts',
    element: () => import('./FamilyPage'),
    roles: ['admin', 'parent'],
  },
];
