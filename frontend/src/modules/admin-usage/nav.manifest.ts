// Admin "Usage" page — per-family Bedrock token cost. In the secondary menu for tenant admins AND
// the platform admin: gate on roles:['admin'] (NOT platformAdmin, which would hide it from tenant
// admins). The page self-guards and GET /admin/usage enforces the admin role (403) regardless.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'admin-usage',
    label: 'Usage',
    group: 'secondary',
    order: 98,
    route: '/admin/usage',
    icon: 'course',
    element: () => import('./AdminUsagePage'),
    roles: ['admin'],
  },
];
