// Nav + route registration for the Activity Journal. The shell globs
// frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on), assembles the
// menus, and builds the router from `element`. We also fill the app-wide Quick-Add FAB slot.

import { registerSlot, type NavEntry } from '../../shared/shell';

// The global Quick-Add FAB body comes from this module.
registerSlot('quick-add', () => import('./QuickAddPanel'));

export const nav: NavEntry[] = [
  {
    id: 'journal',
    label: 'Journal',
    group: 'primary',
    order: 20,
    route: '/journal',
    icon: 'book',
    element: () => import('./JournalPage'),
  },
];
