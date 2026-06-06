// Nav + route registration for Certifications. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'certifications',
    label: 'Certifications',
    group: 'secondary',
    order: 50,
    route: '/certifications',
    icon: 'certificate',
    element: () => import('./CertificationsPage'),
  },
];
