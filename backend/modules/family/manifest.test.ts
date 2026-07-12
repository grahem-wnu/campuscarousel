import { describe, expect, it } from 'vitest';
import type { Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers, type FamilyInviter } from './handlers.js';
import { routes as manifestRoutes } from './routes.manifest.js';

const sig = (r: { method: string; path: string }): string => `${r.method} ${r.path}`;
const noopInviter: FamilyInviter = { inviteMember: async () => {}, setRole: async () => {}, removeMember: async () => {} };
const built = () => buildRoutes(makeHandlers({ getData: () => ({}) as Data, inviter: noopInviter }));

describe('family routes.manifest ↔ buildRoutes', () => {
  it('register the identical method+path set', () => {
    expect(manifestRoutes.map(sig).sort()).toEqual(built().map(sig).sort());
  });

  it('gate the invite create/list/revoke routes to admin+parent', () => {
    const invite = built().filter((r) => r.path.startsWith('/family/invites'));
    expect(invite.map(sig).sort()).toEqual(
      ['GET /family/invites', 'POST /family/invites', 'POST /family/invites/:code/revoke'].sort(),
    );
    expect(invite.every((r) => r.roles?.includes('admin') && r.roles?.includes('parent'))).toBe(true);
  });
});
