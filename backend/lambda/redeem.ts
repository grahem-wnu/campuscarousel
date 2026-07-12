// PUBLIC Lambda entry for the two unauthenticated auth routes (SaaS sub-project 2): invite
// redemption (POST /auth/redeem) and open self-serve signup (POST /auth/signup). A new parent has
// no account yet, so neither can go through the JWT-authorized router. Both provision a new family
// tenant + the parent's Cognito account; signup just skips the invite record and is gated by the
// PUBLIC_SIGNUP_ENABLED env flag (the kill switch if open signup starts being abused). CDK wires
// both routes to this one function (no authorizer) and grants it Cognito-admin + table access.

import { Errors, json, responseForError, validate, type ApiEvent, type ApiResponse } from '../shared/api/index.js';
import { cognitoProvisionerFromEnv, EmailTakenError, LoginNameTakenError } from '../shared/auth/cognito-provisioner.js';
import { dataFromEnv } from '../shared/data/index.js';
import { redeemInvite } from '../modules/invites/redeem.js';
import { publicSignup } from '../modules/invites/signup.js';
import { redeemSchema, signupSchema } from '../modules/invites/schema.js';
import { acceptFamilyInvite } from '../modules/family/accept.js';
import { acceptFamilyInviteSchema } from '../modules/family/schema.js';

export const handler = async (event: ApiEvent): Promise<ApiResponse> => {
  const path = event.rawPath ?? event.requestContext.http.path;
  const isSignup = path.endsWith('/auth/signup');
  const isAccept = path.endsWith('/family/invites/accept');
  try {
    if (isSignup && process.env.PUBLIC_SIGNUP_ENABLED !== 'true') {
      throw Errors.forbidden('Sign-up is currently closed.');
    }
    const body = event.body ? (JSON.parse(event.body) as unknown) : {};
    // Validate BEFORE building deps so a bad body is a 422 even without AWS env. The signup/redeem
    // flows touch only the global registries; accept resolves the tenant internally from the invite.
    if (isAccept) {
      // PUBLIC join-a-family flow. role/studentId/tenant are derived from the stored invite inside
      // acceptFamilyInvite — NEVER from this body (which carries only code/loginName/password/displayName).
      const input = validate(acceptFamilyInviteSchema, body);
      const result = await acceptFamilyInvite(
        { data: dataFromEnv(), provisioner: cognitoProvisionerFromEnv() },
        input,
      );
      return json(201, result);
    }
    if (isSignup) {
      const input = validate(signupSchema, body);
      const result = await publicSignup(
        { data: dataFromEnv(), provisioner: cognitoProvisionerFromEnv() },
        input,
      );
      return json(201, result);
    }
    const input = validate(redeemSchema, body);
    const result = await redeemInvite(
      { data: dataFromEnv(), provisioner: cognitoProvisionerFromEnv() },
      input,
    );
    return json(201, result);
  } catch (err) {
    if (err instanceof EmailTakenError || err instanceof LoginNameTakenError) {
      return json(409, { error: { code: 'conflict', message: err.message } });
    }
    if (err instanceof SyntaxError) {
      return json(422, { error: { code: 'validation', message: 'Invalid JSON body.' } });
    }
    return responseForError(err);
  }
};
