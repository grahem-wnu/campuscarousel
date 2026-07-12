// Route manifest for family-member management. Runs in the tenant context the router sets; member
// records are family-level. Cognito inviter + SES sender + data client resolved lazily from env so
// importing the manifest (e.g. the route-count test) never requires USER_POOL_ID to be set.

import type { RouteDef } from '../../shared/api/index.js';
import { cognitoFamilyInviterFromEnv } from '../../shared/auth/cognito-provisioner.js';
import { dataFromEnv, type Data } from '../../shared/data/index.js';
import { buildRoutes, makeHandlers, type FamilyInviter } from './handlers.js';

let cachedData: Data | undefined;
let cachedInviter: FamilyInviter | undefined;
const inviter = (): FamilyInviter => (cachedInviter ??= cognitoFamilyInviterFromEnv());

// Lazy facade: the real Cognito inviter (and its USER_POOL_ID read) is built only on first mutation.
const lazyInviter: FamilyInviter = {
  inviteMember: (i) => inviter().inviteMember(i),
  setRole: (i) => inviter().setRole(i),
  removeMember: (i) => inviter().removeMember(i),
};

const h = makeHandlers({
  getData: (): Data => (cachedData ??= dataFromEnv()),
  inviter: lazyInviter,
});

export const routes: RouteDef[] = buildRoutes(h);
