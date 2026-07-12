// backend/shared/metering/invoke-messages.ts
import { randomUUID } from 'node:crypto';
import { recordUsage } from './record.js';
import { parseUsage } from './parse-usage.js';
import type { RecordDeps } from './record.js';

/** Minimal Bedrock client surface — lets tests inject a fake `send`. */
export interface BedrockSend {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}

export interface InvokeMessagesParams {
  feature: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  modelId?: string;
  client?: BedrockSend;
  requestId?: string; // groups multi-call operations; defaults to a fresh uuid
  recordDeps?: RecordDeps; // injectable metering client/rates for tests
}

let cachedClient: BedrockSend | undefined;

/**
 * The single metered seam for non-web-grounded Bedrock calls. Builds the standard Anthropic
 * Messages body, sends one InvokeModel, decodes the completion text, records token usage
 * (attributed to `feature` + the ambient tenant/student), and returns the joined text.
 */
export async function invokeMessages(params: InvokeMessagesParams): Promise<string> {
  const modelId = params.modelId ?? process.env.BEDROCK_MODEL_ID;
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');

  const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  let client = params.client;
  if (!client) {
    const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
    client = cachedClient ??= new BedrockRuntimeClient({}) as unknown as BedrockSend;
  }

  const body: Record<string, unknown> = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: params.maxTokens ?? 1500,
    messages: [{ role: 'user', content: params.prompt }],
  };
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.system) body.system = params.system;

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(body)),
  });

  const res = await client.send(command);
  if (!res.body) throw new Error('empty Bedrock response');
  const decoded = JSON.parse(new TextDecoder().decode(res.body)) as {
    content?: Array<{ text?: string }>;
    usage?: Record<string, number>;
  };

  // Record usage as a side effect — recordUsage never throws.
  await recordUsage(
    {
      feature: params.feature,
      model: modelId,
      usage: parseUsage(decoded),
      requestId: params.requestId ?? randomUUID(),
      callId: randomUUID(),
      occurredAt: new Date().toISOString(),
    },
    params.recordDeps,
  );

  return (decoded.content ?? []).map((c) => c.text ?? '').join('');
}
