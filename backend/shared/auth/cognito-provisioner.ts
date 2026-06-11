// Cognito-backed TenantProvisioner (SaaS sub-project 2): create the parent's auth account during
// self-signup. Username = the family's email; we stamp custom:role=parent + custom:tenantId, set the
// family-chosen password as permanent (no forced reset — they just chose it), so they can sign in
// immediately. The client is resolved lazily so importing stays side-effect free.

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { TenantProvisioner } from '../../modules/invites/redeem.js';

export class EmailTakenError extends Error {
  constructor() {
    super('An account with that email already exists.');
    this.name = 'EmailTakenError';
  }
}

export function cognitoProvisioner(userPoolId: string, region?: string): TenantProvisioner {
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
  };
}

export function cognitoProvisionerFromEnv(env: NodeJS.ProcessEnv = process.env): TenantProvisioner {
  const poolId = env.USER_POOL_ID;
  if (!poolId) throw new Error('USER_POOL_ID is not set');
  return cognitoProvisioner(poolId, env.AWS_REGION);
}
