// Tavily client tests — key resolution (env precedence + no-key degradation) and result mapping.
// The SSM path isn't exercised here (it needs the AWS SDK + a live param); env-key + fetch-mock
// cover the client surface, and bedrock.test.ts proves the search seam via an injected searcher.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTavilyKey,
  resetKeyCacheForTest,
  SearchNotConfiguredError,
  tavilySearch,
} from './search.js';

afterEach(() => {
  resetKeyCacheForTest();
  vi.restoreAllMocks();
});

describe('getTavilyKey', () => {
  it('uses TAVILY_API_KEY from env when present', async () => {
    await expect(getTavilyKey({ TAVILY_API_KEY: 'tvly-test' } as NodeJS.ProcessEnv)).resolves.toBe(
      'tvly-test',
    );
  });

  it('throws SearchNotConfiguredError when neither key nor SSM location is set', async () => {
    await expect(getTavilyKey({} as NodeJS.ProcessEnv)).rejects.toBeInstanceOf(
      SearchNotConfiguredError,
    );
  });
});

describe('tavilySearch', () => {
  it('maps Tavily results to {title,url,snippet} and sends the key in the body (not logged)', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
      const sent = JSON.parse(init?.body ?? '{}') as { api_key?: string; query?: string };
      expect(sent.api_key).toBe('tvly-secret');
      expect(sent.query).toBe('UMich BSN deadline');
      return {
        ok: true,
        json: async () => ({
          results: [
            { title: 'UMich Nursing', url: 'https://umich.edu/nursing', content: 'Deadline Feb 1.' },
            { title: 'Other', url: 'https://x.test', content: 'snippet' },
          ],
        }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('TAVILY_API_KEY', 'tvly-secret');

    const results = await tavilySearch('UMich BSN deadline', { maxResults: 2 });

    expect(results).toEqual([
      { title: 'UMich Nursing', url: 'https://umich.edu/nursing', snippet: 'Deadline Feb 1.' },
      { title: 'Other', url: 'https://x.test', snippet: 'snippet' },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws on a non-OK Tavily response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response));
    vi.stubEnv('TAVILY_API_KEY', 'tvly-secret');
    await expect(tavilySearch('q')).rejects.toThrow(/HTTP 401/);
  });
});
