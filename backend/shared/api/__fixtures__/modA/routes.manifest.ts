// Test fixture: a sample module manifest (not a real module — lives under api/__fixtures__ so it
// is ignored by the check:routes guard, which only globs backend/modules/*).
import type { RouteDef } from '../../types.js';

export const routes: RouteDef[] = [
  { method: 'GET', path: '/alpha', handler: async () => ({ status: 200, body: { mod: 'A' } }) },
  { method: 'POST', path: '/alpha', handler: async () => ({ status: 201, body: { mod: 'A' } }) },
];
