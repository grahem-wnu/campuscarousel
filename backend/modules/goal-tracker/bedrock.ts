// Bedrock binding for the goal suggester. This is the only AWS-touching file in the module; the
// prompt builder, output parser, and composition logic live in suggester.ts (pure + tested). The
// model/inference-profile id comes from the BEDROCK_MODEL_ID env var the infra sets on the routing
// Lambda (infra/lib/api-stack.ts) — never hardcoded — and the Lambda role already grants
// bedrock:InvokeModel on that profile. Region comes from the Lambda runtime (AWS_REGION).

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { makeSuggester, unavailableSuggester, type GoalSuggester, type ModelInvoker } from './suggester.js';

/** Minimal surface of the Bedrock client we use — lets tests inject a fake `send`. */
type Invoker = Pick<BedrockRuntimeClient, 'send'>;

/** Build a ModelInvoker over a Bedrock client. The client is resolved lazily so importing this
 *  module never constructs an AWS client (and tests can pass a fake). */
export function makeBedrockInvoker(getClient: () => Invoker): ModelInvoker {
  return async (prompt) => {
    const modelId = process.env.BEDROCK_MODEL_ID;
    if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      // Anthropic Claude messages API on Bedrock. The prompt already asks for a JSON array only.
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1500,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    // `send`'s overloads make the bare call ambiguous to TS; the response shape is known here.
    const res = (await (getClient().send as (c: InvokeModelCommand) => Promise<{ body: Uint8Array }>)(
      command,
    )) as { body: Uint8Array };
    const payload = JSON.parse(new TextDecoder().decode(res.body)) as {
      content?: { type: string; text?: string }[];
    };
    return (payload.content ?? []).map((block) => block.text ?? '').join('');
  };
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
  suggest: (input) =>
    process.env.BEDROCK_MODEL_ID ? realSuggester.suggest(input) : unavailableSuggester.suggest(input),
};
