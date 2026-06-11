// PUBLIC Lambda entry for invite redemption / family self-signup (SaaS sub-project 2). This is the ONE
// unauthenticated endpoint: a new parent has no account yet, so it canNOT go through the JWT-authorized
// router. It validates {code, email, password, familyName}, then redeemInvite provisions a new family
// tenant + the parent's Cognito account (via the Cognito provisioner). CDK wires this to a public
// POST /auth/redeem route (no authorizer) and grants it Cognito-admin + table access.

import { json, responseForError, validate, type ApiEvent, type ApiResponse } from '../shared/api/index.js';
import { cognitoProvisionerFromEnv, EmailTakenError } from '../shared/auth/cognito-provisioner.js';
import { dataFromEnv } from '../shared/data/index.js';
import { redeemInvite } from '../modules/invites/redeem.js';
import { redeemSchema } from '../modules/invites/schema.js';

export const handler = async (event: ApiEvent): Promise<ApiResponse> => {
  try {
    const body = event.body ? (JSON.parse(event.body) as unknown) : {};
    const input = validate(redeemSchema, body);
    // redeemInvite touches only the global invite + tenant registries (base client) — no tenant context.
    const result = await redeemInvite(
      { data: dataFromEnv(), provisioner: cognitoProvisionerFromEnv() },
      input,
    );
    return json(201, result);
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return json(409, { error: { code: 'conflict', message: err.message } });
    }
    if (err instanceof SyntaxError) {
      return json(422, { error: { code: 'validation', message: 'Invalid JSON body.' } });
    }
    return responseForError(err);
  }
};
