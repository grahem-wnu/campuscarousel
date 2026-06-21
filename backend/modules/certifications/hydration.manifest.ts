// Worker-side registration for async cert-guidance research. The hydration-bundle build
// (backend/scripts/build-lambda.mjs) discovers each module's `hydration.manifest.ts` and statically
// imports its `hydration` export into the worker's `type → handler` registry. So when an SQS message
// with `type: 'cert-guidance'` lands on the shared hydration queue, the worker invokes this handler
// (inside the message's tenant/student context, established by the worker entry) with the full 300s
// budget — enough for the web-grounded Bedrock research the API can't run inline. The data client +
// researcher are resolved lazily, exactly like routes.manifest.

import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { CERT_GUIDANCE_TYPE, makeBedrockGuidanceResearcher, makeWorkerHandler } from './guidance.js';

let cached: Data | undefined;
const getData = (): Data => (cached ??= dataFromEnv());
// Web-grounded on the worker (AI_WEB_SEARCH is on there) so it can find real local providers.
const handler = makeWorkerHandler(getData, makeBedrockGuidanceResearcher({ webSearch: true }));

/** `{ type, handler }` — matches the worker's `HydrationRegistration`; globbed into the registry. */
export const hydration = { type: CERT_GUIDANCE_TYPE, handler };
