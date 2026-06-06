import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { Hydrator } from './ai.js';
import {
  buildHydrationMessage,
  hydrateScholarship,
  makeInlineDispatcher,
  makeSqsEnqueuer,
  makeWorkerHandler,
  type SqsSender,
} from './hydration.js';

let data: Data;
beforeEach(() => {
  data = makeData(new InMemoryTableClient());
});

const fixedHydrator: Hydrator = ({ name }) =>
  Promise.resolve({ provider: `${name} Foundation`, amount: 4242, hydrationStatus: 'complete' });

async function seed(name = 'Future Nurses'): Promise<string> {
  const s = await data.scholarships.create({ name, status: 'discovered' } as Parameters<Data['scholarships']['create']>[0]);
  return s.scholarshipId;
}

describe('buildHydrationMessage', () => {
  it('builds a typed scholarship-hydrate message', () => {
    expect(buildHydrationMessage('sc1')).toEqual({ type: 'scholarship-hydrate', scholarshipId: 'sc1' });
  });
});

describe('hydrateScholarship', () => {
  it('merges the AI patch (preserving user edits) and returns the updated record', async () => {
    const id = await seed();
    const updated = await hydrateScholarship(() => data, fixedHydrator, id);
    expect(updated).toMatchObject({ provider: 'Future Nurses Foundation', amount: 4242, hydrationStatus: 'complete' });
    expect((await data.scholarships.get(id))?.amount).toBe(4242);
  });

  it('returns null when the scholarship is gone', async () => {
    expect(await hydrateScholarship(() => data, fixedHydrator, 'ghost')).toBeNull();
  });
});

describe('makeInlineDispatcher', () => {
  it('hydrates in-request and reaches a terminal status', async () => {
    const id = await seed();
    const dispatch = makeInlineDispatcher(() => data, fixedHydrator);
    const res = await dispatch(id);
    expect(res?.hydrationStatus).toBe('complete');
  });
});

describe('makeWorkerHandler', () => {
  it('hydrates the scholarship named in the message payload', async () => {
    const id = await seed();
    await makeWorkerHandler(() => data, fixedHydrator)({ type: 'scholarship-hydrate', scholarshipId: id });
    expect((await data.scholarships.get(id))?.amount).toBe(4242);
  });

  it('ignores a payload with no scholarshipId', async () => {
    await expect(makeWorkerHandler(() => data, fixedHydrator)({ type: 'scholarship-hydrate' })).resolves.toBeUndefined();
  });
});

describe('makeSqsEnqueuer', () => {
  it('sends a SendMessageCommand with the message body to the configured queue', async () => {
    const send = vi.fn(async (_c: unknown) => ({}));
    const enqueuer = makeSqsEnqueuer({ queueUrl: 'https://sqs/test', client: { send } as SqsSender });
    await enqueuer.enqueue('sc9');
    const command = send.mock.calls[0]![0] as unknown as { input: { QueueUrl: string; MessageBody: string } };
    expect(command.input.QueueUrl).toBe('https://sqs/test');
    expect(JSON.parse(command.input.MessageBody)).toEqual({ type: 'scholarship-hydrate', scholarshipId: 'sc9' });
  });

  it('throws when no queue url is configured (bulk-add treats this as best-effort)', async () => {
    const prev = process.env.HYDRATION_QUEUE_URL;
    delete process.env.HYDRATION_QUEUE_URL;
    const enqueuer = makeSqsEnqueuer({ client: { send: vi.fn() } as SqsSender });
    await expect(enqueuer.enqueue('x')).rejects.toThrow('HYDRATION_QUEUE_URL');
    if (prev !== undefined) process.env.HYDRATION_QUEUE_URL = prev;
  });
});
