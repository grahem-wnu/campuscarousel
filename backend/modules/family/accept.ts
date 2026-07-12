// PUBLIC accept-invite flow (pure, no framework — the HTTP entry is the unauthenticated redeem Lambda).
// Someone with a shareable family code chooses a login name + password and joins an EXISTING family as a
// co-parent, viewer, or student. SECURITY MODEL:
//   • role, studentId, and tenant come ONLY from the stored invite — never from the caller's body. This
//     is what stops a redeemer from escalating to admin or attaching to another family/child.
//   • the code is CLAIMED atomically (pending→accepted) BEFORE provisioning, so a code is single-use even
//     under concurrent redeems (the losing claim gets a ConditionFailedError → 409).
//   • on a provision failure (e.g. the chosen login name is taken) we roll the claim back to `pending`
//     (best-effort) and rethrow, so a routine, recoverable failure lets the invitee retry without burning
//     the code. Single-provision still holds: only one caller ever holds the claim at a time.

import { Errors } from '../../shared/api/index.js';
import type { Data, FamilyInvite, MemberRelationship } from '../../shared/data/index.js';
import { ConditionFailedError } from '../../shared/data/table-client.js';
import { runWithTenant } from '../../shared/tenant/index.js';
import type { Role } from '../../shared/auth/index.js';
import type { InviteProvisioner } from '../invites/redeem.js';

export interface AcceptDeps {
  data: Data;
  provisioner: InviteProvisioner;
  now?: () => Date;
}

export interface AcceptInput {
  code: string;
  loginName: string;
  password: string;
  displayName?: string;
}

export interface AcceptResult {
  tenantId: string;
  role: Role;
  loginName: string;
}

/** Map the invite `kind` to the JWT role the new login gets. */
function roleForKind(kind: FamilyInvite['kind']): Role {
  switch (kind) {
    case 'coparent':
      return 'parent';
    case 'viewer':
      return 'member';
    case 'student':
      return 'student';
  }
}

export async function acceptFamilyInvite(deps: AcceptDeps, input: AcceptInput): Promise<AcceptResult> {
  const now = deps.now ?? (() => new Date());
  const { data, provisioner } = deps;

  // 1. Validate the invite is redeemable. (Global lookup — no tenant context needed.)
  const invite = await data.familyInvites.get(input.code);
  if (!invite) throw Errors.validation('Invalid invite code.');
  if (invite.status === 'revoked') throw Errors.validation('This invite has been revoked.');
  if (invite.status === 'accepted') throw Errors.validation('This invite has already been used.');
  if (invite.expiresAt && invite.expiresAt < now().toISOString()) {
    throw Errors.validation('This invite has expired.');
  }

  // Everything the new login gets is derived HERE from the stored invite — never from `input`.
  const role = roleForKind(invite.kind);
  const tenantId = invite.tenantId;

  // 2. Claim the code atomically (pending→accepted). A concurrent claim loses with ConditionFailedError.
  try {
    await data.familyInvites.claim(input.code);
  } catch (err) {
    if (err instanceof ConditionFailedError) throw Errors.conflict('This invite has already been used.');
    throw err;
  }

  // Best-effort release the claim so the invitee can retry (used on any post-claim failure).
  const unclaim = () => data.familyInvites.update(input.code, { status: 'pending' }).catch(() => {});

  return runWithTenant(tenantId, async () => {
    // 3. For a student invite, re-check the roster row exists and isn't already linked (fail closed).
    if (invite.kind === 'student') {
      const child = await data.students.get(invite.studentId!);
      if (!child) {
        await unclaim();
        throw Errors.notFound('Student not found');
      }
      if (child.loginUserId) {
        await unclaim();
        throw Errors.conflict('That child already has a login.');
      }
    }

    // 4. Provision the login. On failure, un-claim so the code can be retried, then rethrow.
    try {
      await provisioner.provisionFromInvite({
        loginName: input.loginName,
        password: input.password,
        tenantId,
        role,
        ...(invite.studentId ? { studentId: invite.studentId } : {}),
      });
    } catch (err) {
      await unclaim();
      throw err; // e.g. LoginNameTakenError → surfaced to the JoinFamilyPage for retry
    }

    // 5. Record the family membership (no email — a code-invited member may not have one).
    const relationship: MemberRelationship =
      invite.relationship ?? (invite.kind === 'student' ? 'child' : 'other');
    await data.members.put({
      userId: input.loginName,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      relationship,
      accessLevel: invite.kind === 'viewer' ? 'viewer' : 'manager',
      ...(invite.kind === 'student' ? { studentId: invite.studentId } : {}),
      status: 'active',
      invitedBy: invite.invitedBy,
    });

    // 6. Link the login to the roster child.
    if (invite.kind === 'student') {
      await data.students.update(invite.studentId!, { loginUserId: input.loginName });
    }

    return { tenantId, role, loginName: input.loginName };
  });
}
