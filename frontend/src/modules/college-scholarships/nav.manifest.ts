// Route registration for the standalone scholarship dossier. The shell globs
// frontend/src/modules/*/nav.manifest.ts and builds the router from `element`.
//
// Hidden: this is a detail page reached from a college's Scholarships tab, never a menu item. The
// dossier runs to fifteen sections, which is a document rather than a row — expanding it inline
// inside a list of twenty-odd awards read as confusing, so it gets its own page and its own URL.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'college-scholarship-detail',
    label: 'Scholarship',
    group: 'secondary',
    order: 99,
    route: '/colleges/:id/scholarships/:scholarshipId',
    icon: 'scholarship',
    hidden: true,
    element: () => import('./ScholarshipDetailPage'),
  },
];
