// Bedrock binding for the goal suggester. This is the only AWS-touching file in the module; the
// prompt builder, output parser, and composition logic live in suggester.ts (pure + tested). The
// model/inference-profile id comes from the BEDROCK_MODEL_ID env var the infra sets on the routing
// Lambda (infra/lib/api-stack.ts) — never hardcoded — and the Lambda role already grants
// bedrock:InvokeModel on that profile. Region comes from the Lambda runtime (AWS_REGION).

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { invokeMessages, type BedrockSend } from '../../shared/metering/index.js';
import { makeSuggester, unavailableSuggester, type GoalSuggester, type ModelInvoker } from './suggester.js';

/** Minimal surface of the Bedrock client we use — lets tests inject a fake `send`. */
type Invoker = Pick<BedrockRuntimeClient, 'send'>;

/** Build a ModelInvoker over a Bedrock client. The client is resolved lazily so importing this
 *  module never constructs an AWS client (and tests can pass a fake). Bedrock calls funnel through
 *  the metered `invokeMessages` seam so token usage is attributed to the family + `goal-suggest`. */
export function makeBedrockInvoker(getClient: () => Invoker): ModelInvoker {
  return (prompt) =>
    invokeMessages({
      feature: 'goal-suggest',
      prompt,
      maxTokens: 1500,
      temperature: 0.5,
      client: getClient() as unknown as BedrockSend,
    });
}

let cachedClient: BedrockRuntimeClient | undefined;
const realInvoker = makeBedrockInvoker(() => (cachedClient ??= new BedrockRuntimeClient({})));
const realSuggester = makeSuggester(realInvoker);

/**
 * Production suggester: the real Bedrock-backed suggester when BEDROCK_MODEL_ID is configured (the
 * deployed Lambda), else the clean 503 placeholder (local/unconfigured). The decision is per-call so
 * it tracks the environment rather than import-time state.
 */
export const bedrockSuggester: GoalSuggester = {
  suggest: (input, majors) =>
    process.env.BEDROCK_MODEL_ID
      ? realSuggester.suggest(input, majors)
      : unavailableSuggester.suggest(input, majors),
};
