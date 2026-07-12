// Admin invite console (SaaS sub-project 2). Shown in the secondary menu ONLY to platform admins
// (platformAdmin gate hides it from the menu AND the router for everyone else). The page self-guards and
// the API enforces platform-admin (403) regardless.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'admin-invites',
    label: 'Invites',
    group: 'secondary',
    order: 99,
    route: '/admin/invites',
    icon: 'contacts',
    element: () => import('./AdminInvitesPage'),
    platformAdmin: true,
  },
];
