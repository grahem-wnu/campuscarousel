import { describe, expect, it, vi } from 'vitest';
import { cleanTitle, fetchPageTitle, resolveSourceTitles, type FetchLike } from './source-titles.js';

const html = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body>x</body></html>`;
const ok = (body: string): Awaited<ReturnType<FetchLike>> => ({ ok: true, text: async () => body });

describe('cleanTitle', () => {
  it('decodes entities and collapses whitespace', () => {
    expect(cleanTitle('Nursing &amp; Health   Sciences\n')).toBe('Nursing & Health Sciences');
  });
  it('caps very long titles', () => {
    expect(cleanTitle('x'.repeat(200)).endsWith('…')).toBe(true);
  });
});

describe('fetchPageTitle', () => {
  it('extracts the <title>', async () => {
    const fetchFn: FetchLike = async () => ok(html('Registered Nurses : OOH'));
    expect(await fetchPageTitle('https://bls.gov/x', fetchFn)).toBe('Registered Nurses : OOH');
  });
  it('returns null on a non-ok response, a missing title, or a throw', async () => {
    expect(await fetchPageTitle('u', async () => ({ ok: false, text: async () => '' }))).toBeNull();
    expect(await fetchPageTitle('u', async () => ok('<html><head></head></html>'))).toBeNull();
    expect(await fetchPageTitle('u', async () => { throw new Error('network'); })).toBeNull();
  });
});

describe('resolveSourceTitles', () => {
  it('prefers the search title (no fetch) and fetches the page <title> for the rest', async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ok(html('Fetched Page')));
    const out = await resolveSourceTitles(
      ['https://a.edu', 'https://b.edu'],
      new Map([['https://a.edu', 'Search Title A']]),
      fetchFn,
    );
    expect(out).toEqual([
      { url: 'https://a.edu', title: 'Search Title A' },
      { url: 'https://b.edu', title: 'Fetched Page' },
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1); // only the un-titled one was fetched
    expect(fetchFn).toHaveBeenCalledWith('https://b.edu');
  });

  it('omits URLs that could not be titled (UI falls back to URL parsing)', async () => {
    const fetchFn: FetchLike = async () => ({ ok: false, text: async () => '' });
    const out = await resolveSourceTitles(['https://a.edu', 'https://b.edu'], new Map([['https://a.edu', 'A']]), fetchFn);
    expect(out).toEqual([{ url: 'https://a.edu', title: 'A' }]);
  });

  it('dedupes repeated URLs', async () => {
    const fetchFn: FetchLike = async () => ok(html('Z'));
    const out = await resolveSourceTitles(['https://a.edu', 'https://a.edu'], new Map([['https://a.edu', 'A']]), fetchFn);
    expect(out).toEqual([{ url: 'https://a.edu', title: 'A' }]);
  });
});
