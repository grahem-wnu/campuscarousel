// Nav + route registration for the Opportunity Finder (v2.1 Module 18). Visible to all roles.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'opportunities',
    label: 'Opportunities',
    group: 'secondary',
    order: 55,
    route: '/opportunities',
    icon: 'search',
    element: () => import('./OpportunitiesPage'),
  },
];
