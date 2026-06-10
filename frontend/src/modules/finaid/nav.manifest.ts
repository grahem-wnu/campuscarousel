// Nav + route registration for the Financial Aid Center (v2.1 Module 19). Visible to all roles.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'finaid',
    label: 'Financial Aid',
    group: 'secondary',
    order: 92,
    route: '/finaid',
    icon: 'scholarship',
    element: () => import('./FinAidPage'),
  },
];
