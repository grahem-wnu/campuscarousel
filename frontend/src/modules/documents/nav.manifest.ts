// Nav + route registration for the Documents vault (v2.1 F2). The shell globs
// frontend/src/modules/*/nav.manifest.ts. Visible to all roles.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'documents',
    label: 'Documents',
    group: 'secondary',
    order: 96,
    route: '/documents',
    icon: 'application',
    element: () => import('./DocumentsPage'),
  },
];
