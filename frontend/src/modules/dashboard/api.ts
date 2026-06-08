// The module's data call. Thin wrapper over the shared typed API client.

import { api } from '../../shared/api';
import type { Dashboard } from './types';

export function getDashboard(): Promise<Dashboard> {
  return api.get<Dashboard>('/dashboard');
}
