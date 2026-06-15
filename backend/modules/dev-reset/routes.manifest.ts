// ⚠️ TEMPORARY TESTING AID — see handlers.ts. Remove with the module.
import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = [{ method: 'POST', path: '/admin/hard-reset', handler: h.hardReset }];
