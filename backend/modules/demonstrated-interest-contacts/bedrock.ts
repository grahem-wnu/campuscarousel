// Bedrock binding for the recommender briefer. The only AWS-touching file in the module; the prompt
// builder lives in briefs.ts (pure + tested). BEDROCK_MODEL_ID comes from the env the infra sets on
// the routing Lambda — never hardcoded — and the Lambda role grants bedrock:InvokeModel. Mirrors
// goal-tracker/bedrock.ts.

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { makeBriefer, unavailableBriefer, type Briefer, type ModelInvoker } from './briefs.js';

type Invoker = Pick<BedrockRuntimeClient, 'send'>;

export function makeBedrockInvoker(getClient: () => Invoker): ModelInvoker {
  return async (prompt) => {
    const modelId = process.env.BEDROCK_MODEL_ID;
    if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1500,
        temperature: 0.5,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const res = (await (getClient().send as (c: InvokeModelCommand) => Promise<{ body: Uint8Array }>)(
      command,
    )) as { body: Uint8Array };
    const payload = JSON.parse(new TextDecoder().decode(res.body)) as { content?: { type: string; text?: string }[] };
    return (payload.content ?? []).map((b) => b.text ?? '').join('');
  };
}

let cachedClient: BedrockRuntimeClient | undefined;
const realBriefer = makeBriefer(makeBedrockInvoker(() => (cachedClient ??= new BedrockRuntimeClient({}))));

/** Production briefer: real Bedrock when BEDROCK_MODEL_ID is set, else the clean 503 placeholder. */
export const bedrockBriefer: Briefer = {
  brief: (contact, sources, focus) =>
    process.env.BEDROCK_MODEL_ID ? realBriefer.brief(contact, sources, focus) : unavailableBriefer.brief(contact, sources, focus),
};
