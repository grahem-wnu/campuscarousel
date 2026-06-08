import { afterEach, describe, expect, it, vi } from 'vitest';
import { bedrockSuggester, makeBedrockInvoker } from './bedrock.js';

const ORIGINAL = process.env.BEDROCK_MODEL_ID;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BEDROCK_MODEL_ID;
  else process.env.BEDROCK_MODEL_ID = ORIGINAL;
});

/** A fake Bedrock client whose `send` returns a Claude-messages-shaped body. */
function fakeClient(modelText: string) {
  const send = vi.fn(async (_command: unknown) => ({
    body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text: modelText }] })),
  }));
  return { client: { send } as never, send };
}

describe('makeBedrockInvoker', () => {
  it('throws when BEDROCK_MODEL_ID is unset (caller decides the fallback)', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    const { client } = fakeClient('[]');
    await expect(makeBedrockInvoker(() => client)('prompt')).rejects.toThrow('BEDROCK_MODEL_ID');
  });

  it('sends an InvokeModelCommand with the env model id and decodes the completion text', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.anthropic.test-profile';
    const { client, send } = fakeClient('[{"title":"X"}]');
    const out = await makeBedrockInvoker(() => client)('my prompt');
    expect(out).toBe('[{"title":"X"}]');
    const command = send.mock.calls[0]![0] as unknown as { input: { modelId: string; body: string } };
    expect(command.input.modelId).toBe('us.anthropic.test-profile');
    const body = JSON.parse(command.input.body) as { messages: { role: string; content: string }[] };
    expect(body.messages[0]).toMatchObject({ role: 'user', content: 'my prompt' });
  });
});

describe('bedrockSuggester', () => {
  it('degrades to a 503 when Bedrock is not configured', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    await expect(bedrockSuggester.suggest({})).rejects.toMatchObject({ status: 503 });
  });
});
