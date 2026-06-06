import { describe, expect, it } from 'vitest';
import { buildHydrationMessage, unavailableEnqueuer } from './hydration.js';

describe('buildHydrationMessage', () => {
  it('builds a typed scholarship-hydrate message anchored on name (+ provider when present)', () => {
    expect(buildHydrationMessage({ scholarshipId: 'sc1', name: 'Future Nurses', provider: 'ANA' })).toEqual({
      type: 'scholarship-hydrate',
      scholarshipId: 'sc1',
      name: 'Future Nurses',
      provider: 'ANA',
    });
  });

  it('omits provider when absent', () => {
    expect(buildHydrationMessage({ scholarshipId: 'sc2', name: 'Solo' })).toEqual({
      type: 'scholarship-hydrate',
      scholarshipId: 'sc2',
      name: 'Solo',
    });
  });
});

describe('unavailableEnqueuer', () => {
  it('rejects with a 503 until the async hydration infra lands', async () => {
    await expect(
      unavailableEnqueuer.enqueue({ type: 'scholarship-hydrate', scholarshipId: 'x', name: 'n' }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
