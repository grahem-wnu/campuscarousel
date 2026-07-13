import { afterEach, describe, expect, it, vi } from 'vitest';
import { bedrockAssistant, makeBedrockInvoker } from './bedrock.js';
import type { ChatMessage } from './chat.js';

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

const history: ChatMessage[] = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: 'hi there' },
  { role: 'user', content: 'help me' },
];

describe('makeBedrockInvoker', () => {
  it('throws when BEDROCK_MODEL_ID is unset (caller decides the fallback)', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    const { client } = fakeClient('reply');
    await expect(makeBedrockInvoker(() => client)('sys', history)).rejects.toThrow('BEDROCK_MODEL_ID');
  });

  it('sends the system prompt and full conversation turns, decodes the completion text', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.anthropic.test-profile';
    const { client, send } = fakeClient('an answer');
    const out = await makeBedrockInvoker(() => client)('you are helpful', history);
    expect(out).toBe('an answer');
    const command = send.mock.calls[0]![0] as unknown as { input: { modelId: string; body: Uint8Array } };
    expect(command.input.modelId).toBe('us.anthropic.test-profile');
    const body = JSON.parse(new TextDecoder().decode(command.input.body)) as {
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(body.system).toBe('you are helpful');
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1]).toMatchObject({ role: 'assistant', content: 'hi there' });
  });
});

describe('bedrockAssistant', () => {
  it('degrades to a 503 when Bedrock is not configured', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    await expect(
      bedrockAssistant.reply({} as never, [], 'hi'),
    ).rejects.toMatchObject({ status: 503 });
  });
});
