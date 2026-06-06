// Test fixture: a second sample module manifest.
import type { RouteDef } from '../../types.js';

export const routes: RouteDef[] = [
  { method: 'GET', path: '/beta', handler: async () => ({ status: 200, body: { mod: 'B' } }) },
];
