// Invite redemption (SaaS sub-project 2): validate a code, provision a brand-new family tenant + the
// parent's auth account, and mark the invite accepted. The Cognito user creation is a seam
// (TenantProvisioner) so this logic unit-tests without AWS; production injects a Cognito-backed
// provisioner. NOTE: the HTTP entry for this is PUBLIC (the parent has no account yet), so it is wired
// as a separate unauthenticated route in infra — NOT through the JWT-authorized router.

import { Errors } from '../../shared/api/index.js';
import { newId, type Data } from '../../shared/data/index.js';
import type { Role } from '../../shared/auth/index.js';
import { inviteRedeemError } from './logic.js';

export interface TenantProvisioner {
  /** Create the parent's auth account bound to the tenant (production: Cognito adminCreateUser +
   *  adminSetUserPassword with custom:tenantId + custom:role=parent). */
  createParentUser(input: { email: string; password: string; tenantId: string }): Promise<void>;
}

/**
 * Seam for provisioning a login when someone accepts a shareable FAMILY invite (co-parent, viewer, or
 * student) into an EXISTING tenant. Production: Cognito adminCreateUser + adminSetUserPassword stamping
 * custom:role + custom:tenantId (+ custom:studentId for a student). A duplicate login name surfaces as
 * `LoginNameTakenError` so the invitee can retry with a different name (the invite is un-claimed).
 */
export interface InviteProvisioner {
  provisionFromInvite(input: {
    loginName: string;
    password: string;
    tenantId: string;
    role: Role;
    studentId?: string;
  }): Promise<void>;
}

export interface RedeemDeps {
  data: Data;
  provisioner: TenantProvisioner;
  now?: () => Date;
  newTenantId?: () => string;
}

export interface RedeemInput {
  code: string;
  email: string;
  password: string;
  familyName?: string;
}

/** Redeem an invite → returns the new tenant id. Throws a 422 if the code isn't redeemable. */
export async function redeemInvite(deps: RedeemDeps, input: RedeemInput): Promise<{ tenantId: string }> {
  const now = deps.now ?? (() => new Date());
  const newTenantId = deps.newTenantId ?? newId;

  const invite = await deps.data.invites.get(input.code);
  const err = inviteRedeemError(invite, input.email, now().toISOString());
  if (err) throw Errors.validation(err);

  const tenantId = newTenantId();
  await deps.data.tenants.create({
    tenantId,
    familyName: input.familyName?.trim() || invite!.familyName || 'Family',
    plan: invite!.plan,
    status: 'active',
    consent: { acceptedAt: now().toISOString(), byEmail: input.email },
  });
  // Provision the auth account after the tenant exists. If this throws, the invite stays pending so it
  // can be retried (a rare orphan tenant is acceptable and admin-cleanable).
  await deps.provisioner.createParentUser({ email: input.email, password: input.password, tenantId });
  await deps.data.invites.update(input.code, { status: 'accepted', acceptedTenantId: tenantId });
  return { tenantId };
}
