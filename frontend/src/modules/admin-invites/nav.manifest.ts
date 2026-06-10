// Admin invite console (SaaS sub-project 2). Registered as a HIDDEN route — it doesn't appear in the
// nav menus (it's platform-admin only); Grahem reaches it at /admin/invites. The page self-guards, and
// the API enforces platform-admin (403) regardless.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'admin-invites',
    label: 'Invites (admin)',
    group: 'secondary',
    order: 99,
    route: '/admin/invites',
    icon: 'contacts',
    element: () => import('./AdminInvitesPage'),
    hidden: true,
  },
];
