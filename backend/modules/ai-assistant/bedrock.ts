// Bedrock binding for the assistant. The only AWS-touching file in the module; mode resolution,
// prompt assembly, and parsing live in chat.ts (pure + tested). The model/inference-profile id
// comes from the BEDROCK_MODEL_ID env var the infra sets on the routing Lambda — never hardcoded —
// and the Lambda role already grants bedrock:InvokeModel on that profile (a Sonnet inference
// profile per the spec). Region comes from the Lambda runtime. Mirrors goal-tracker/bedrock.ts.

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { makeAssistant, unavailableAssistant, type Assistant, type ChatMessage, type ModelInvoker } from './chat.js';

type Invoker = Pick<BedrockRuntimeClient, 'send'>;

/** Build a ModelInvoker over a Bedrock client. The client is resolved lazily so importing this
 *  module never constructs an AWS client (and tests can pass a fake). Uses the Anthropic messages
 *  API on Bedrock with a top-level `system` prompt and the conversation turns. */
export function makeBedrockInvoker(getClient: () => Invoker): ModelInvoker {
  return async (system: string, messages: ChatMessage[]) => {
    const modelId = process.env.BEDROCK_MODEL_ID;
    if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1200,
        temperature: 0.6,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
const realAssistant = makeAssistant(makeBedrockInvoker(() => (cachedClient ??= new BedrockRuntimeClient({}))));

/**
 * Production assistant: the real Bedrock-backed assistant when BEDROCK_MODEL_ID is configured (the
 * deployed Lambda), else the clean 503 placeholder (local/unconfigured). Decided per-call so it
 * tracks the environment rather than import-time state.
 */
export const bedrockAssistant: Assistant = {
  reply: (bundle, history, message) =>
    process.env.BEDROCK_MODEL_ID
      ? realAssistant.reply(bundle, history, message)
      : unavailableAssistant.reply(bundle, history, message),
};
