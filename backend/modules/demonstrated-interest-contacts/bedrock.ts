// Bedrock binding for the recommender briefer. The only AWS-touching file in the module; the prompt
// builder lives in briefs.ts (pure + tested). BEDROCK_MODEL_ID comes from the env the infra sets on
// the routing Lambda — never hardcoded — and the Lambda role grants bedrock:InvokeModel. Mirrors
// goal-tracker/bedrock.ts.

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { invokeMessages, type BedrockSend } from '../../shared/metering/index.js';
import { makeBriefer, unavailableBriefer, type Briefer, type ModelInvoker } from './briefs.js';

type Invoker = Pick<BedrockRuntimeClient, 'send'>;

/** Bedrock calls funnel through the metered `invokeMessages` seam so token usage is attributed to
 *  the family + `interest-contacts`. Client resolved lazily so importing never constructs an AWS
 *  client (and tests can pass a fake). */
export function makeBedrockInvoker(getClient: () => Invoker): ModelInvoker {
  return (prompt) =>
    invokeMessages({
      feature: 'interest-contacts',
      prompt,
      maxTokens: 1500,
      temperature: 0.5,
      client: getClient() as unknown as BedrockSend,
    });
}

let cachedClient: BedrockRuntimeClient | undefined;
const realBriefer = makeBriefer(makeBedrockInvoker(() => (cachedClient ??= new BedrockRuntimeClient({}))));

/** Production briefer: real Bedrock when BEDROCK_MODEL_ID is set, else the clean 503 placeholder. */
export const bedrockBriefer: Briefer = {
  brief: (contact, sources, focus, majors) =>
    process.env.BEDROCK_MODEL_ID
      ? realBriefer.brief(contact, sources, focus, majors)
      : unavailableBriefer.brief(contact, sources, focus, majors),
};
