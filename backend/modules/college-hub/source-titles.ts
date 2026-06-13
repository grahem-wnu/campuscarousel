// Resolve readable titles for a college's source URLs during hydration. Most sources come from the
// web search, which already returns a title — we use those for free. For any URL without one (e.g. a
// model-cited link that wasn't searched), we fetch the page and extract its <title> tag, best-effort.
// Anything still untitled is omitted; the UI falls back to parsing the URL. All network is injectable
// (fetchFn) so tests run offline.

const MAX_TITLE = 140;
const MAX_FETCH = 6; // cap page fetches per hydration — titles are a nicety, not worth a long tail
const FETCH_TIMEOUT_MS = 6000;

/** Minimal fetch shape we need (a Response with ok + text()). */
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; text(): Promise<string> }>;

export interface SourceTitle {
  url: string;
  title: string;
}

/** Decode the handful of HTML entities that show up in titles, collapse whitespace, and cap length. */
export function cleanTitle(raw: string): string {
  const decoded = raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
  const collapsed = decoded.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_TITLE ? `${collapsed.slice(0, MAX_TITLE - 1).trimEnd()}…` : collapsed;
}

/** Best-effort: fetch a URL and extract its <title>. Returns null on any failure. */
export async function fetchPageTitle(url: string, fetchFn: FetchLike): Promise<string | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = m?.[1] ? cleanTitle(m[1]) : '';
    return title || null;
  } catch {
    return null;
  }
}

/** A default fetcher over the global fetch with an AbortController timeout. */
export function defaultTitleFetcher(timeoutMs = FETCH_TIMEOUT_MS): FetchLike {
  return async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return (await (globalThis.fetch as unknown as FetchLike)(url, { signal: controller.signal })) as Awaited<
        ReturnType<FetchLike>
      >;
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Resolve titles for `urls`: prefer the search-result title (free, already fetched), else fetch the
 * page <title>. Returns only the URLs we could title (deduped, source order); the rest fall back to
 * URL parsing in the UI. Page fetches are capped at MAX_FETCH.
 */
export async function resolveSourceTitles(
  urls: readonly string[],
  searchTitles: ReadonlyMap<string, string>,
  fetchFn: FetchLike,
): Promise<SourceTitle[]> {
  const out: SourceTitle[] = [];
  const toFetch: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const known = searchTitles.get(url);
    if (known) out.push({ url, title: cleanTitle(known) });
    else toFetch.push(url);
  }
  for (const url of toFetch.slice(0, MAX_FETCH)) {
    const title = await fetchPageTitle(url, fetchFn);
    if (title) out.push({ url, title });
  }
  return out;
}
