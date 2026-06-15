// The focus enqueuers route interactive overview/career jobs to the dedicated FOCUS queue when
// configured, falling back to the shared HYDRATION queue (and then inline). Guards the priority-lane
// wiring: a user-initiated "Generate" must not land on the bulk college-hydration queue.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import { runWithStudent, runWithTenant } from '../../shared/tenant/index.js';
import { makeSqsOverviewEnqueuer, type SqsSender } from './overview.js';
import { makeSqsCareerEnqueuer } from './careerpath.js';

let data: Data;
const getData = () => data;
let focusPrev: string | undefined;
let hydrationPrev: string | undefined;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  focusPrev = process.env.FOCUS_QUEUE_URL;
  hydrationPrev = process.env.HYDRATION_QUEUE_URL;
});
afterEach(() => {
  if (focusPrev !== undefined) process.env.FOCUS_QUEUE_URL = focusPrev;
  else delete process.env.FOCUS_QUEUE_URL;
  if (hydrationPrev !== undefined) process.env.HYDRATION_QUEUE_URL = hydrationPrev;
  else delete process.env.HYDRATION_QUEUE_URL;
});

function capturingClient() {
  const seen: { url?: string } = {};
  const client: SqsSender = {
    send: async (cmd) => {
      seen.url = (cmd as { input?: { QueueUrl?: string } }).input?.QueueUrl;
      return {};
    },
  };
  return { client, seen };
}

describe('focus enqueuers — priority lane routing', () => {
  it('overview prefers FOCUS_QUEUE_URL over the shared hydration queue', async () => {
    process.env.FOCUS_QUEUE_URL = 'https://sqs.test/focus';
    process.env.HYDRATION_QUEUE_URL = 'https://sqs.test/hydration';
    const { client, seen } = capturingClient();
    const enqueue = makeSqsOverviewEnqueuer(getData, { client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue()));
    expect(seen.url).toBe('https://sqs.test/focus');
  });

  it('overview falls back to HYDRATION_QUEUE_URL when no focus queue is set', async () => {
    delete process.env.FOCUS_QUEUE_URL;
    process.env.HYDRATION_QUEUE_URL = 'https://sqs.test/hydration';
    const { client, seen } = capturingClient();
    const enqueue = makeSqsOverviewEnqueuer(getData, { client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue()));
    expect(seen.url).toBe('https://sqs.test/hydration');
  });

  it('career path prefers FOCUS_QUEUE_URL over the shared hydration queue', async () => {
    process.env.FOCUS_QUEUE_URL = 'https://sqs.test/focus';
    process.env.HYDRATION_QUEUE_URL = 'https://sqs.test/hydration';
    const { client, seen } = capturingClient();
    const enqueue = makeSqsCareerEnqueuer(getData, { client });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue()));
    expect(seen.url).toBe('https://sqs.test/focus');
  });

  it('an explicit queueUrl option wins over both env vars', async () => {
    process.env.FOCUS_QUEUE_URL = 'https://sqs.test/focus';
    const { client, seen } = capturingClient();
    const enqueue = makeSqsOverviewEnqueuer(getData, { client, queueUrl: 'https://sqs.test/explicit' });
    await runWithTenant('fam1', () => runWithStudent('s1', () => enqueue()));
    expect(seen.url).toBe('https://sqs.test/explicit');
  });
});
