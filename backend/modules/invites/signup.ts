// Public self-serve signup (no invite): provision a brand-new family tenant + the parent's auth
// account. This is invite redemption (redeem.ts) minus the invite record, sharing the same
// TenantProvisioner seam so the logic unit-tests without AWS. The HTTP entry (lambda/redeem.ts)
// is PUBLIC and gates this behind the PUBLIC_SIGNUP_ENABLED env flag — the abuse kill switch.
// Design: docs/superpowers/specs/2026-07-04-public-signup-design.md

import { newId, type Data } from '../../shared/data/index.js';
import type { TenantProvisioner } from './redeem.js';

export interface SignupDeps {
  data: Data;
  provisioner: TenantProvisioner;
  now?: () => Date;
  newTenantId?: () => string;
}

export interface SignupInput {
  email: string;
  password: string;
  familyName?: string;
}

/** Open signup → returns the new tenant id. New families start on the free plan. */
export async function publicSignup(deps: SignupDeps, input: SignupInput): Promise<{ tenantId: string }> {
  const now = deps.now ?? (() => new Date());
  const tenantId = (deps.newTenantId ?? newId)();
  await deps.data.tenants.create({
    tenantId,
    familyName: input.familyName?.trim() || 'Family',
    plan: 'free',
    status: 'active',
    consent: { acceptedAt: now().toISOString(), byEmail: input.email },
  });
  // Provision the auth account after the tenant exists (same order as redeem). If this throws, the
  // rare orphan tenant is admin-cleanable and the person can simply retry the signup.
  await deps.provisioner.createParentUser({ email: input.email, password: input.password, tenantId });
  return { tenantId };
}
