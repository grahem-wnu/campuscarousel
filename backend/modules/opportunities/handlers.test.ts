import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Discoverer } from './ai.js';
import { makeHandlers, type OpportunityHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };
const stubDiscoverer: Discoverer = async (input) => [
  { name: 'CHOC Volunteen', organization: 'CHOC', type: 'hospital-volunteer', location: input.location ?? 'Orange, CA' },
];

let data: Data;
let h: OpportunityHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  h = makeHandlers({ getData: () => data, discoverer: stubDiscoverer });
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

type CreateInput = Parameters<Data['opportunities']['create']>[0];

describe('CRUD', () => {
  it('create defaults to interested + manual', async () => {
    const res = await h.create(ctx({ body: { name: 'Shadow an ICU nurse', type: 'shadowing' } }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'interested', addedBy: 'manual' });
  });
  it('422 on an unknown field', async () => {
    await expect(h.create(ctx({ body: { name: 'x', type: 'shadowing', nope: 1 } }))).rejects.toMatchObject({
      status: 422,
    });
  });
  it('422 on a bad type', async () => {
    await expect(h.create(ctx({ body: { name: 'x', type: 'flying' } }))).rejects.toMatchObject({ status: 422 });
  });
});

describe('list filters', () => {
  beforeEach(async () => {
    await data.opportunities.create({ name: 'A', type: 'shadowing', status: 'interested' } as CreateInput);
    await data.opportunities.create({
      name: 'B',
      type: 'cna-program',
      status: 'completed',
      organization: 'Saddleback',
    } as CreateInput);
  });
  it('filters by type and by free-text search', async () => {
    const byType = ((await h.list(ctx({ query: { type: 'shadowing' } }))).body as { opportunities: unknown[] })
      .opportunities;
    expect(byType).toHaveLength(1);
    const bySearch = ((await h.list(ctx({ query: { search: 'saddleback' } }))).body as { opportunities: unknown[] })
      .opportunities;
    expect(bySearch).toHaveLength(1);
  });
});

describe('discover / bulk-add', () => {
  it('discover runs inline (202, complete), pollable, persists nothing', async () => {
    const res = await h.discover(ctx({ body: { location: 'Orange, CA', type: 'hospital-volunteer' } }));
    expect(res.status).toBe(202);
    const job = res.body as { jobId: string; status: string; candidates?: { name: string }[] };
    expect(job.status).toBe('complete');
    expect(job.candidates?.[0]?.name).toBe('CHOC Volunteen');
    expect(await data.opportunities.list()).toHaveLength(0);

    const poll = await h.discoverStatus(ctx({ params: { jobId: job.jobId } }));
    expect(poll.status).toBe(200);
    expect((poll.body as { candidates: { name: string }[] }).candidates[0]?.name).toBe('CHOC Volunteen');
  });

  it('bulk-add saves discovered candidates as ai-discovered/discovered', async () => {
    const res = await h.bulkAdd(ctx({ body: { items: [{ name: 'CHOC Volunteen', type: 'hospital-volunteer' }] } }));
    expect((res.body as { added: number }).added).toBe(1);
    const list = await data.opportunities.list();
    expect(list[0]).toMatchObject({ status: 'discovered', addedBy: 'ai-discovered' });
  });
});
