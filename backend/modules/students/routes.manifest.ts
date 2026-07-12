// Route manifest for the student roster (multi-student per family). Family-level repos run inside the
// tenant context set by the router. Data client resolved lazily.

import type { RouteDef } from '../../shared/api/index.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

let cached: Data | undefined;
const h = makeHandlers({ getData: (): Data => (cached ??= dataFromEnv()) });

export const routes: RouteDef[] = buildRoutes(h);
