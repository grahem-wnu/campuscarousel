// Tests for the SQS hydration worker entry: registry assembly from module registrations
// (the same mechanism build-lambda.mjs wires up via the generated barrel), duplicate-type
// failure, and dispatch/drain/retry behavior of the worker handler.

import { describe, expect, it, vi } from 'vitest';
import {
  buildRegistry,
  makeHandler,
  hydrationRegistry,
  type HydrationRegistration,
} from './hydration.js';

const record = (body: unknown, messageId = 'm1') => ({
  messageId,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('buildRegistry', () => {
  it('populates a type -> handler map from module registrations', async () => {
    const a: HydrationRegistration = { type: 'college-hydrate', handler: vi.fn(async () => {}) };
    const b: HydrationRegistration = { type: 'scholarship-hydrate', handler: vi.fn(async () => {}) };

    const registry = buildRegistry([a, b]);

    expect(Object.keys(registry).sort()).toEqual(['college-hydrate', 'scholarship-hydrate']);
    expect(registry['college-hydrate']).toBe(a.handler);
    expect(registry['scholarship-hydrate']).toBe(b.handler);
  });

  it('fails loudly on a duplicate type across modules (mirrors the route duplicate guard)', () => {
    const regs: HydrationRegistration[] = [
      { type: 'college-hydrate', handler: async () => {} },
      { type: 'college-hydrate', handler: async () => {} },
    ];
    expect(() => buildRegistry(regs)).toThrow(/Duplicate hydration type.*college-hydrate/);
  });

  it('is empty for no registrations', () => {
    expect(buildRegistry([])).toEqual({});
  });
});

describe('the live hydrationRegistry export', () => {
  it('is assembled from the generated barrel without throwing (no duplicate types on the branch)', () => {
    expect(hydrationRegistry).toBeTypeOf('object');
  });
});

describe('makeHandler', () => {
  it('dispatches a message to the handler registered for its type', async () => {
    const handled: unknown[] = [];
    const registry = { 'college-hydrate': async (p: unknown) => void handled.push(p) };
    const handler = makeHandler(registry);

    const res = await handler({ Records: [record({ type: 'college-hydrate', collegeId: 'c1', tenantId: 'fam1' })] });

    expect(handled).toEqual([{ type: 'college-hydrate', collegeId: 'c1', tenantId: 'fam1' }]);
    expect(res.batchItemFailures).toEqual([]);
  });

  it('refuses a message with no tenantId (fail closed) — reports a batch item failure', async () => {
    const handled: unknown[] = [];
    const res = await makeHandler({ 'college-hydrate': async (p: unknown) => void handled.push(p) })({
      Records: [record({ type: 'college-hydrate', collegeId: 'c1' }, 'noTen')],
    });
    expect(handled).toEqual([]); // handler never ran un-scoped
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: 'noTen' }]);
  });

  it('drains an unknown type without failing the batch', async () => {
    const handler = makeHandler({ 'college-hydrate': async () => {} });
    const res = await handler({ Records: [record({ type: 'nope' }), record({}, 'm2')] });
    expect(res.batchItemFailures).toEqual([]);
  });

  it('reports a throwing handler as a batch item failure (so SQS retries -> DLQ)', async () => {
    const handler = makeHandler({
      boom: async () => {
        throw new Error('hydration failed');
      },
    });
    const res = await handler({ Records: [record({ type: 'boom', tenantId: 'fam1' }, 'mX')] });
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: 'mX' }]);
  });

  it('reports malformed JSON as a batch item failure', async () => {
    const handler = makeHandler({});
    const res = await handler({ Records: [{ messageId: 'bad', body: '{not json' }] });
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: 'bad' }]);
  });
});
