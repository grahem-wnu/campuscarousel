// Bedrock binding for the benchmark researcher. This is the only AWS-touching file in the module;
// the prompt builders, output parsers, and composition logic live in researcher.ts (pure + tested).
// The model/inference-profile id comes from the BEDROCK_MODEL_ID env var the infra sets on the
// routing Lambda — never hardcoded — and the Lambda role already grants bedrock:InvokeModel on that
// profile. Region comes from the Lambda runtime (AWS_REGION). Mirrors goal-tracker/bedrock.ts.

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { makeResearcher, unavailableResearcher, type BenchmarkResearcher, type ModelInvoker } from './researcher.js';

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
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1500,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
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
const realResearcher = makeResearcher(realInvoker);

/**
 * Production researcher: the real Bedrock-backed researcher when BEDROCK_MODEL_ID is configured (the
 * deployed Lambda), else the clean 503 placeholder (local/unconfigured). Decided per-call so it
 * tracks the environment rather than import-time state.
 */
export const bedrockResearcher: BenchmarkResearcher = {
  research: (college, focus) =>
    process.env.BEDROCK_MODEL_ID
      ? realResearcher.research(college, focus)
      : unavailableResearcher.research(college, focus),
  analyzeGaps: (stats, rows) =>
    process.env.BEDROCK_MODEL_ID
      ? realResearcher.analyzeGaps(stats, rows)
      : unavailableResearcher.analyzeGaps(stats, rows),
};
