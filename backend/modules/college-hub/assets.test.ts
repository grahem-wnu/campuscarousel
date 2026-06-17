import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { College } from '../../shared/data/index.js';
import {
  ASSETS_TYPE,
  fetchCollegeAssets,
  makeAssetsWorker,
  makeWikimediaImageSource,
  type AssetStore,
  type FetchLike,
  type FetchedImage,
  type ImageSource,
} from './assets.js';

let data: Data;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
});
const getData = () => data;

async function seed(over: Partial<College> = {}): Promise<string> {
  const c = await data.colleges.create({
    name: 'Ohio State',
    website: 'https://www.osu.edu',
    userEdited: [],
    ...over,
  } as Parameters<Data['colleges']['create']>[0]);
  return c.collegeId;
}

const img = (ext: string, credit?: string): FetchedImage => ({
  bytes: new Uint8Array([1, 2, 3]),
  contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
  ext,
  credit,
});

/** A store that just echoes a predictable CDN url for the key. */
const echoStore: AssetStore = async (key) => `https://cdn.test/${key}`;

describe('fetchCollegeAssets', () => {
  it('caches campus + logo and records the CDN urls + credit + complete status', async () => {
    const id = await seed();
    const source: ImageSource = async () => ({
      campus: img('jpg', 'Photo: Someone · CC BY-SA via Wikimedia'),
      logo: img('png'),
    });
    await fetchCollegeAssets(getData, source, echoStore, id);
    const after = await data.colleges.get(id);
    expect(after?.campusImageUrl).toBe(`https://cdn.test/colleges/${id}/campus.jpg`);
    expect(after?.logoImageUrl).toBe(`https://cdn.test/colleges/${id}/logo.png`);
    expect(after?.campusImageCredit).toBe('Photo: Someone · CC BY-SA via Wikimedia');
    expect(after?.assetsStatus).toBe('complete');
  });

  it('marks complete with no urls when nothing is found (clean no-op, not a failure)', async () => {
    const id = await seed();
    await fetchCollegeAssets(getData, async () => ({}), echoStore, id);
    const after = await data.colleges.get(id);
    expect(after?.assetsStatus).toBe('complete');
    expect(after?.campusImageUrl).toBeUndefined();
    expect(after?.logoImageUrl).toBeUndefined();
  });

  it('sets failed when the source throws', async () => {
    const id = await seed();
    await fetchCollegeAssets(getData, async () => { throw new Error('network'); }, echoStore, id);
    expect((await data.colleges.get(id))?.assetsStatus).toBe('failed');
  });

  it('sets failed when the store throws', async () => {
    const id = await seed();
    const boomStore: AssetStore = async () => { throw new Error('s3 down'); };
    await fetchCollegeAssets(getData, async () => ({ campus: img('jpg') }), boomStore, id);
    expect((await data.colleges.get(id))?.assetsStatus).toBe('failed');
  });

  it('never overwrites a user-edited campus url', async () => {
    const id = await seed({ campusImageUrl: 'https://mine.test/pic.jpg', userEdited: ['campusImageUrl'] });
    await fetchCollegeAssets(getData, async () => ({ campus: img('jpg') }), echoStore, id);
    expect((await data.colleges.get(id))?.campusImageUrl).toBe('https://mine.test/pic.jpg');
  });

  it('is a no-op for a missing college', async () => {
    await expect(fetchCollegeAssets(getData, async () => ({ campus: img('jpg') }), echoStore, 'ghost')).resolves.toBeUndefined();
  });
});

describe('makeAssetsWorker', () => {
  it('processes a well-formed message', async () => {
    const id = await seed();
    await makeAssetsWorker(getData, async () => ({ campus: img('jpg') }), echoStore)({ type: ASSETS_TYPE, collegeId: id });
    expect((await data.colleges.get(id))?.campusImageUrl).toBe(`https://cdn.test/colleges/${id}/campus.jpg`);
  });

  it('ignores a malformed message (no collegeId)', async () => {
    const worker = makeAssetsWorker(getData, async () => ({}), echoStore);
    await expect(worker({ type: ASSETS_TYPE })).resolves.toBeUndefined();
    await expect(worker(null)).resolves.toBeUndefined();
  });
});

/** A fake fetch that routes by URL substring; image routes return bytes, JSON routes return json. */
function fakeFetch(routes: { match: string; res: Partial<Awaited<ReturnType<FetchLike>>> }[]): FetchLike {
  return vi.fn(async (url: string) => {
    const route = routes.find((r) => url.includes(r.match));
    const base = {
      ok: true,
      status: 200,
      headers: { get: () => null } as { get(n: string): string | null },
      json: async () => ({}),
      arrayBuffer: async () => new Uint8Array([0]).buffer,
    };
    return { ...base, ...(route?.res ?? { ok: false, status: 404 }) };
  });
}

describe('makeWikimediaImageSource', () => {
  it('pulls a campus thumbnail + credit from Wikimedia and a logo from Clearbit', async () => {
    const fetchFn = fakeFetch([
      {
        match: 'prop=pageimages',
        res: {
          json: async () => ({
            query: { pages: { '123': { thumbnail: { source: 'https://upload.wikimedia.org/osu.jpg' }, pageimage: 'Osu.jpg' } } },
          }),
        },
      },
      {
        match: 'prop=imageinfo',
        res: {
          json: async () => ({
            query: { pages: { '123': { imageinfo: [{ extmetadata: { Artist: { value: '<a href="#">Jane Roe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } },
          }),
        },
      },
      {
        match: 'upload.wikimedia.org/osu.jpg',
        res: { headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'image/jpeg' : null) }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
      },
      {
        match: 'logo.clearbit.com',
        res: { headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'image/png' : null) }, arrayBuffer: async () => new Uint8Array([4, 5]).buffer },
      },
    ]);

    const source = makeWikimediaImageSource({ fetchFn });
    const { campus, logo } = await source({ name: 'Ohio State University', website: 'https://www.osu.edu' });

    expect(campus?.ext).toBe('jpg');
    expect(campus?.contentType).toBe('image/jpeg');
    expect(campus?.credit).toBe('Photo: Jane Roe · CC BY-SA 4.0 via Wikimedia');
    expect(logo?.ext).toBe('png');
  });

  it('returns no campus image when Wikipedia has no page thumbnail', async () => {
    const fetchFn = fakeFetch([
      { match: 'prop=pageimages', res: { json: async () => ({ query: { pages: { '-1': {} } } }) } },
    ]);
    const source = makeWikimediaImageSource({ fetchFn });
    const { campus, logo } = await source({ name: 'Nowhere College' });
    expect(campus).toBeUndefined();
    expect(logo).toBeUndefined(); // no website → no Clearbit attempt
  });

  it('falls back to an AI-discovered campus URL when Wikimedia has none (skipping ones that fail)', async () => {
    const fetchFn = fakeFetch([
      { match: 'prop=pageimages', res: { json: async () => ({ query: { pages: { '-1': {} } } }) } },
      // The first candidate URL 404s (no route → default 404); the second resolves to a real image.
      { match: 'good.example/campus.jpg', res: { headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'image/jpeg' : null) }, arrayBuffer: async () => new Uint8Array([9, 9]).buffer } },
    ]);
    const source = makeWikimediaImageSource({ fetchFn });
    const { campus } = await source({
      name: 'Nowhere College',
      campusImageUrls: ['https://bad.example/missing.jpg', 'https://good.example/campus.jpg'],
    });
    expect(campus?.ext).toBe('jpg');
    expect(campus?.contentType).toBe('image/jpeg');
  });

  it('ignores a non-image response (e.g. an error page)', async () => {
    const fetchFn = fakeFetch([
      { match: 'prop=pageimages', res: { json: async () => ({ query: { pages: { '1': { thumbnail: { source: 'https://x/y' } } } } }) } },
      { match: 'x/y', res: { headers: { get: () => 'text/html' }, arrayBuffer: async () => new Uint8Array([0]).buffer } },
    ]);
    const source = makeWikimediaImageSource({ fetchFn });
    expect((await source({ name: 'X' })).campus).toBeUndefined();
  });
});
