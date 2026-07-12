// backend/shared/metering/parse-usage.test.ts
import { describe, expect, it } from 'vitest';
import { parseUsage } from './parse-usage.js';

describe('parseUsage', () => {
  it('reads all four token classes from the Anthropic usage block', () => {
    const usage = parseUsage({
      usage: {
        input_tokens: 100,
        output_tokens: 40,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    });
    expect(usage).toEqual({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    });
  });

  it('defaults missing fields to 0 (no usage block => all zeros)', () => {
    expect(parseUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it('tolerates a partial usage block (only input/output)', () => {
    expect(parseUsage({ usage: { input_tokens: 7, output_tokens: 3 } })).toEqual({
      inputTokens: 7,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });
});
