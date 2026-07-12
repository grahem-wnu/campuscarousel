// Cognito-backed TenantProvisioner (SaaS sub-project 2): create the parent's auth account during
// self-signup. Username = the family's email; we stamp custom:role=parent + custom:tenantId, set the
// family-chosen password as permanent (no forced reset — they just chose it), so they can sign in
// immediately. The client is resolved lazily so importing stays side-effect free.

import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { InviteProvisioner, TenantProvisioner } from '../../modules/invites/redeem.js';
import type { FamilyInviter } from '../../modules/family/handlers.js';

export class EmailTakenError extends Error {
  constructor() {
    super('An account with that email already exists.');
    this.name = 'EmailTakenError';
  }
}

export class LoginNameTakenError extends Error {
  constructor() {
    super('That login name is already taken. Please choose another.');
    this.name = 'LoginNameTakenError';
  }
}

export function cognitoProvisioner(
  userPoolId: string,
  region?: string,
): TenantProvisioner & InviteProvisioner {
  let client: CognitoIdentityProviderClient | undefined;
  const get = (): CognitoIdentityProviderClient =>
    (client ??= new CognitoIdentityProviderClient(region ? { region } : {}));
  return {
    async createParentUser({ email, password, tenantId }) {
      try {
        await get().send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            MessageAction: 'SUPPRESS', // we don't use Cognito's email; the app handled the invite
            UserAttributes: [
              { Name: 'custom:role', Value: 'parent' },
              { Name: 'custom:tenantId', Value: tenantId },
            ],
          }),
        );
      } catch (err) {
        if (err instanceof UsernameExistsException) throw new EmailTakenError();
        throw err;
      }
      // Set the family-chosen password as permanent so they can sign in right away.
      await get().send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: email,
          Password: password,
          Permanent: true,
        }),
      );
    },
    // Provision a login for someone accepting a shareable family invite. Username = the invitee-chosen
    // loginName (NOT an email — students have no email). Stamp custom:role/tenantId (+ studentId for a
    // student) and set the chosen password as permanent so they can sign in immediately.
    async provisionFromInvite({ loginName, password, tenantId, role, studentId }) {
      try {
        await get().send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: loginName,
            MessageAction: 'SUPPRESS',
            UserAttributes: [
              { Name: 'custom:role', Value: role },
              { Name: 'custom:tenantId', Value: tenantId },
              ...(studentId ? [{ Name: 'custom:studentId', Value: studentId }] : []),
            ],
          }),
        );
      } catch (err) {
        if (err instanceof UsernameExistsException) throw new LoginNameTakenError();
        throw err;
      }
      await get().send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: loginName,
          Password: password,
          Permanent: true,
        }),
      );
    },
    // Delete a login provisioned above — cleanup when a post-provision accept step fails, so no orphan
    // login is left behind.
    async removeLogin({ username }) {
      await get().send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
    },
  };
}

export function cognitoProvisionerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TenantProvisioner & InviteProvisioner {
  const poolId = env.USER_POOL_ID;
  if (!poolId) throw new Error('USER_POOL_ID is not set');
  return cognitoProvisioner(poolId, env.AWS_REGION);
}

/**
 * Cognito-backed FamilyInviter: re-role / remove an EXISTING member's login within a tenant (the
 * family-member management flow). New logins are minted by the accept-invite flow (provisionFromInvite),
 * not here. Members are addressed by `username` (the Cognito username), NOT email — code-invited members
 * (esp. students) have no email. Re-roling updates `custom:role` so the router's manager/viewer
 * enforcement follows the change; removal deletes the account.
 */
export function cognitoFamilyInviter(userPoolId: string, region?: string): FamilyInviter {
  let client: CognitoIdentityProviderClient | undefined;
  const get = (): CognitoIdentityProviderClient =>
    (client ??= new CognitoIdentityProviderClient(region ? { region } : {}));
  return {
    async setRole({ username, role }) {
      await get().send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: username,
          UserAttributes: [{ Name: 'custom:role', Value: role }],
        }),
      );
    },
    async removeMember({ username }) {
      await get().send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
    },
  };
}

export function cognitoFamilyInviterFromEnv(env: NodeJS.ProcessEnv = process.env): FamilyInviter {
  const poolId = env.USER_POOL_ID;
  if (!poolId) throw new Error('USER_POOL_ID is not set');
  return cognitoFamilyInviter(poolId, env.AWS_REGION);
}
