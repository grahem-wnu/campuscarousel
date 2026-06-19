// Campus imagery + logo enrichment for College Hub. Runs in the async assets pipeline (a dedicated
// SQS queue + worker Lambda, parallel to — and never blocking — the Bedrock text hydration). Given a
// collegeId, it sources a campus photo (Wikimedia lead image, openly licensed) and a school logo
// (Clearbit by website domain), caches both to the media S3 bucket behind CloudFront, and records
// OUR CDN urls on the college via `mergePreservingUserEdits` (so a manual edit is never clobbered).
//
// Everything is injectable (image source + asset store) so tests run with no network/AWS. Any
// failure degrades gracefully: a thrown error sets `assetsStatus: 'failed'`; "no image found" is a
// clean no-op (`assetsStatus: 'complete'`, the field simply stays unset and the card uses today's
// layout). The text hydrator writes a disjoint set of fields, so the two workers never fight.

import type { College, Data } from '../../shared/data/index.js';

/** SQS message `type` discriminator for a single-college asset-fetch job. */
export const ASSETS_TYPE = 'college-assets';

export interface CollegeAssetsMessage {
  type: typeof ASSETS_TYPE;
  collegeId: string;
}

/** A fetched image ready to cache. */
export interface FetchedImage {
  bytes: Uint8Array;
  contentType: string;
  /** File extension without the dot, e.g. "jpg" | "png". */
  ext: string;
  /** Attribution/license text (Wikimedia Commons expects visible credit). */
  credit?: string;
}

/** Resolves a college's campus photo + logo as raw images ready to cache. Injectable for tests. */
export type ImageSource = (
  college: Pick<College, 'name' | 'state' | 'website' | 'campusImageUrls'>,
) => Promise<{ campus?: FetchedImage; logo?: FetchedImage }>;

/** Persists image bytes under `key` and returns the public (CDN) url. Injectable for tests. */
export type AssetStore = (key: string, image: FetchedImage) => Promise<string>;

/** image/jpeg → "jpg", image/png → "png", … (defaults to jpg for unknown image types). */
function extFromContentType(contentType: string): string {
  const t = contentType.toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('svg')) return 'svg';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  return 'jpg';
}

/** Bare domain from a URL ("https://www.osu.edu/x" → "osu.edu"), or undefined. Mirrors the UI rule. */
function domainOf(website?: string): string | undefined {
  if (!website) return undefined;
  const m = website
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0];
  return m && m.includes('.') ? m : undefined;
}

/** Registrable root domain (last two labels) — logo providers want the root, not a subdomain
 *  (dornsife.usc.edu → usc.edu). */
function rootDomainOf(website?: string): string | undefined {
  const d = domainOf(website);
  if (!d) return undefined;
  const parts = d.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : d;
}

/** Strip HTML tags / collapse whitespace from a Wikimedia extmetadata field. */
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB guard — a 1200px thumbnail is well under this.

/** Minimal fetch shape (global `fetch`) so tests can inject a fake without the DOM types. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface WikimediaSourceOptions {
  /** Injectable fetch (tests); defaults to the Node 20 global `fetch`. */
  fetchFn?: FetchLike;
  /** Per-request timeout; best-effort (AbortController) when the global fetch is used. */
  timeoutMs?: number;
}

/** Download a URL as a `FetchedImage`, or undefined if it isn't a usable image. */
async function downloadImage(
  fetchFn: FetchLike,
  url: string,
  credit?: string,
): Promise<FetchedImage | undefined> {
  const res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return undefined;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('image/')) return undefined;
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return undefined;
  return { bytes: new Uint8Array(buf), contentType, ext: extFromContentType(contentType), credit };
}

const USER_AGENT = 'CampusCarousel/1.0 (private college tracker; campus imagery)';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/** Build a short attribution from a Wikimedia Commons file's extmetadata (artist + license). */
function commonsCredit(meta: Record<string, { value?: string }>): string {
  const artist = meta.Artist?.value ? plainText(meta.Artist.value) : undefined;
  const license = meta.LicenseShortName?.value ? plainText(meta.LicenseShortName.value) : undefined;
  return `Photo: ${[artist, license].filter(Boolean).join(' · ') || 'Wikimedia Commons'} via Wikimedia Commons`.slice(0, 300);
}

/** Search Wikimedia Commons for an actual CAMPUS photo. A university's Wikipedia lead image is
 *  usually the school seal (already shown as the app's logo), not a campus — so for the hero we
 *  search Commons' File namespace for "<name> campus", keep raster photos (skipping seals/diagrams/
 *  video), and cache the most relevant one that downloads. Free, no API key, served from the
 *  Wikimedia CDN (stable, no hotlink 404s). */
async function commonsCampusImage(fetchFn: FetchLike, name: string): Promise<FetchedImage | undefined> {
  const search = encodeURIComponent(`${name} campus`);
  const q = `${COMMONS_API}?action=query&format=json&generator=search&gsrsearch=${search}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=1200`;
  const res = await fetchFn(q, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) return undefined;
  const body = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { index?: number; imageinfo?: { thumburl?: string; url?: string; mime?: string; extmetadata?: Record<string, { value?: string }> }[] }
      >;
    };
  };
  const candidates = Object.values(body.query?.pages ?? {})
    .filter((p) => {
      const mime = p.imageinfo?.[0]?.mime ?? '';
      return mime === 'image/jpeg' || mime === 'image/png';
    })
    .sort((a, b) => (a.index ?? 999) - (b.index ?? 999)); // search relevance order
  for (const p of candidates) {
    const ii = p.imageinfo![0]!;
    const url = ii.thumburl ?? ii.url;
    if (!url) continue;
    const img = await downloadImage(fetchFn, url, commonsCredit(ii.extmetadata ?? {})).catch(() => undefined);
    if (img) return img;
  }
  return undefined;
}

/** Ask the Wikimedia API for a college's lead image (a fixed-width thumbnail) + its source filename. */
async function wikimediaCampusImage(
  fetchFn: FetchLike,
  name: string,
): Promise<FetchedImage | undefined> {
  const q = `${WIKI_API}?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=1200&titles=${encodeURIComponent(name)}`;
  const res = await fetchFn(q, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { query?: { pages?: Record<string, unknown> } };
  const pages = body.query?.pages ?? {};
  const page = Object.values(pages)[0] as { thumbnail?: { source?: string }; pageimage?: string } | undefined;
  const thumbUrl = page?.thumbnail?.source;
  if (!thumbUrl) return undefined;
  const credit = page?.pageimage ? await wikimediaCredit(fetchFn, page.pageimage) : undefined;
  return downloadImage(fetchFn, thumbUrl, credit);
}

/** Build an attribution string for a Wikimedia file from its extmetadata (artist + license). */
async function wikimediaCredit(fetchFn: FetchLike, fileName: string): Promise<string | undefined> {
  try {
    const q = `${WIKI_API}?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(`File:${fileName}`)}`;
    const res = await fetchFn(q, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { query?: { pages?: Record<string, unknown> } };
    const page = Object.values(body.query?.pages ?? {})[0] as
      | { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }
      | undefined;
    const meta = page?.imageinfo?.[0]?.extmetadata ?? {};
    const artist = meta.Artist?.value ? plainText(meta.Artist.value) : undefined;
    const license = meta.LicenseShortName?.value ? plainText(meta.LicenseShortName.value) : undefined;
    const parts = [artist, license].filter(Boolean).join(' · ');
    return `Photo: ${parts || 'Wikimedia Commons'} via Wikimedia`.slice(0, 300);
  } catch {
    return undefined;
  }
}

/** Fetch a college logo to cache: try Clearbit on the ROOT domain (a real logo when available), then
 *  the site favicon (very high availability — for .edu schools that's typically the crest). Returns
 *  undefined if both fail, so the worker simply stores no logo. */
async function fetchLogo(fetchFn: FetchLike, website?: string): Promise<FetchedImage | undefined> {
  const root = rootDomainOf(website);
  if (!root) return undefined;
  return (
    (await downloadImage(fetchFn, `https://logo.clearbit.com/${root}`).catch(() => undefined)) ??
    (await downloadImage(fetchFn, `https://www.google.com/s2/favicons?domain=${root}&sz=128`).catch(() => undefined))
  );
}

/** Default image source: campus photo from Wikimedia, logo cached from Clearbit/favicon. */
export function makeWikimediaImageSource(options: WikimediaSourceOptions = {}): ImageSource {
  const fetchFn = options.fetchFn ?? withTimeout((globalThis.fetch as unknown) as FetchLike, options.timeoutMs ?? 8000);
  return async ({ name, website, campusImageUrls }) => {
    // Commons search is the PRIMARY campus source (real building/campus photos). Fetch the logo in
    // parallel since it's independent of the campus hero.
    const [commons, logo] = await Promise.all([
      commonsCampusImage(fetchFn, name).catch(() => undefined),
      fetchLogo(fetchFn, website),
    ]);
    let campus = commons;
    // Secondary: the Wikipedia article's own page image — a real campus photo for some schools (it
    // returns nothing for the seal-led ones, so it won't surface a logo as the hero).
    if (!campus) campus = await wikimediaCampusImage(fetchFn, name).catch(() => undefined);
    // Last resort: the AI-discovered campus URLs from text hydration. These are frequently
    // hallucinated / 404 (so they're tried last) — cache the first that actually resolves to an image.
    if (!campus && campusImageUrls?.length) {
      for (const url of campusImageUrls.slice(0, 6)) {
        campus = await downloadImage(fetchFn, url).catch(() => undefined);
        if (campus) break;
      }
    }
    return { campus, logo };
  };
}

/** Wrap a fetch with an AbortController timeout (best-effort; the fake fetch in tests ignores it). */
function withTimeout(fetchFn: FetchLike, ms: number): FetchLike {
  return async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Default asset store: PutObject to the media bucket, returning the CloudFront url. Reads
 *  ASSETS_BUCKET + ASSETS_BASE_URL from the env at call time (so construction never needs them). */
export function makeS3AssetStore(env: NodeJS.ProcessEnv = process.env): AssetStore {
  return async (key, image) => {
    const bucket = env.ASSETS_BUCKET;
    const baseUrl = env.ASSETS_BASE_URL;
    if (!bucket || !baseUrl) throw new Error('assets store not configured (ASSETS_BUCKET / ASSETS_BASE_URL)');
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({});
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: image.bytes,
        ContentType: image.contentType,
        CacheControl: 'public, max-age=86400',
      }),
    );
    return `${baseUrl.replace(/\/$/, '')}/${key}`;
  };
}

/**
 * Fetch + cache a college's campus photo and logo, then record the CDN urls. No-op if the college is
 * gone. Sets `assetsStatus: 'complete'` on success (whether or not imagery was found) and
 * 'failed' on any error, so the frontend's poll always sees a terminal state.
 */
export async function fetchCollegeAssets(
  getData: () => Data,
  source: ImageSource,
  store: AssetStore,
  collegeId: string,
): Promise<void> {
  const data = getData();
  const college = await data.colleges.get(collegeId);
  if (!college) return;
  try {
    const { campus, logo } = await source({
      name: college.name,
      state: college.state,
      website: college.website,
      campusImageUrls: college.campusImageUrls,
    });
    const patch: Partial<College> = { assetsStatus: 'complete' };
    if (campus) {
      patch.campusImageUrl = await store(`colleges/${collegeId}/campus.${campus.ext}`, campus);
      if (campus.credit) patch.campusImageCredit = campus.credit;
    }
    if (logo) {
      patch.logoImageUrl = await store(`colleges/${collegeId}/logo.${logo.ext}`, logo);
    }
    await data.colleges.mergePreservingUserEdits(collegeId, patch);
  } catch {
    await data.colleges.mergePreservingUserEdits(collegeId, { assetsStatus: 'failed' }).catch(() => {});
  }
}

/** SQS worker-side handler for the shared worker registry (payload → Promise<void>). */
export function makeAssetsWorker(
  getData: () => Data,
  source: ImageSource = makeWikimediaImageSource(),
  store: AssetStore = makeS3AssetStore(),
): (payload: unknown) => Promise<void> {
  return async (payload) => {
    const msg = (payload ?? {}) as Partial<CollegeAssetsMessage>;
    if (typeof msg.collegeId !== 'string' || !msg.collegeId) return;
    await fetchCollegeAssets(getData, source, store, msg.collegeId);
  };
}
