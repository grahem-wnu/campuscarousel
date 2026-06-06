// Nav + route registration for the Peer Benchmark dashboard (the standalone aggregate view). The
// shell globs frontend/src/modules/*/nav.manifest.ts (no shared nav file to merge-conflict on),
// assembles the menus, and builds the router from `element`. The per-college BenchmarkCard is
// exported for college-hub to mount in its detail tab; it consumes this module's public endpoints.

import type { NavEntry } from '../../shared/shell';

export const nav: NavEntry[] = [
  {
    id: 'peer-benchmark',
    label: 'Benchmark',
    group: 'secondary',
    order: 60,
    route: '/benchmark',
    icon: 'goal',
    element: () => import('./PeerBenchmarkPage'),
  },
];
