import { afterEach, describe, expect, it, vi } from 'vitest';
import { bedrockBriefer, makeBedrockInvoker } from './bedrock.js';

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
    const { client } = fakeClient('brief');
    await expect(makeBedrockInvoker(() => client)('prompt')).rejects.toThrow('BEDROCK_MODEL_ID');
  });

  it('sends an InvokeModelCommand with the env model id and decodes the completion text', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.anthropic.test-profile';
    const { client, send } = fakeClient('A warm brief.');
    const out = await makeBedrockInvoker(() => client)('my prompt');
    expect(out).toBe('A warm brief.');
    const command = send.mock.calls[0]![0] as unknown as { input: { modelId: string; body: Uint8Array } };
    expect(command.input.modelId).toBe('us.anthropic.test-profile');
    const body = JSON.parse(new TextDecoder().decode(command.input.body)) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages[0]).toMatchObject({ role: 'user', content: 'my prompt' });
  });
});

describe('bedrockBriefer', () => {
  it('degrades to a 503 when Bedrock is not configured', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    await expect(
      bedrockBriefer.brief({} as never, {} as never, undefined, []),
    ).rejects.toMatchObject({ status: 503 });
  });
});
