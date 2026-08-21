/**
 * Amplify (v6) auth integration. Username sign-in, no email; tokens live in memory
 * only (Amplify's default in-memory token store — we do NOT enable cookie storage).
 * Pool/client ids come from `VITE_*` env (injected from SSM at build) — no hardcoding.
 *
 * Auth backend (Cognito) is owned by the auth foundational unit; this is purely the
 * frontend client wiring + the NEW_PASSWORD_REQUIRED first-login challenge.
 */
import { Amplify } from "aws-amplify";
import {
  signIn,
  signOut,
  confirmSignIn,
  fetchAuthSession,
  updatePassword,
  type SignInOutput,
} from "aws-amplify/auth";
import type { Role } from "./types";

let configured = false;

/** Configure Amplify once, from env. Safe to call multiple times. */
export function configureAmplify(): void {
  if (configured) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
        loginWith: { username: true, email: false, phone: false },
      },
    },
  });
  configured = true;
}

/** Authenticated identity derived from the ID token claims. */
export interface AuthUser {
  username: string;
  role: Role;
  /** The family/tenant this user belongs to (SaaS). */
  tenantId?: string;
  /** Platform super-admin (Grahem) — gates the admin console. */
  platformAdmin?: boolean;
}

function parseRole(claim: unknown): Role {
  return claim === "admin" || claim === "parent" || claim === "student" || claim === "member"
    ? claim
    : "student";
}

/**
 * Resolve the current user from the in-memory session, or null if signed out.
 * Reads `username` and `custom:role` from the validated ID token claims.
 */
export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken;
    if (!idToken) return null;
    const claims = idToken.payload;
    const username = String(claims["cognito:username"] ?? claims["username"] ?? "");
    if (!username) return null;
    const tenantId = typeof claims["custom:tenantId"] === "string" ? (claims["custom:tenantId"] as string) : undefined;
    const platformAdmin = claims["custom:platformAdmin"] === "true" || claims["custom:platformAdmin"] === true;
    return { username, role: parseRole(claims["custom:role"]), tenantId, platformAdmin };
  } catch {
    return null;
  }
}

export type SignInResult =
  | { status: "done" }
  | { status: "new_password_required" }
  | { status: "error"; message: string };

/** Map an Amplify sign-in next step to our small result union. */
function fromSignInOutput(out: SignInOutput): SignInResult {
  if (out.isSignedIn) return { status: "done" };
  if (out.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
    return { status: "new_password_required" };
  }
  // Other challenge steps (MFA etc.) aren't configured for this app.
  return { status: "error", message: `Unsupported sign-in step: ${out.nextStep.signInStep}` };
}

/** Start a username/password sign-in. */
export async function startSignIn(username: string, password: string): Promise<SignInResult> {
  try {
    // Ensure no stale session blocks a fresh sign-in.
    await signOut().catch(() => undefined);
    const out = await signIn({ username, password });
    return fromSignInOutput(out);
  } catch (err) {
    return { status: "error", message: humanizeAuthError(err) };
  }
}

/** Complete the NEW_PASSWORD_REQUIRED challenge with the chosen password. */
export async function completeNewPassword(newPassword: string): Promise<SignInResult> {
  try {
    const out = await confirmSignIn({ challengeResponse: newPassword });
    return fromSignInOutput(out);
  } catch (err) {
    return { status: "error", message: humanizeAuthError(err) };
  }
}

/** Outcome of a password change — a plain result rather than a thrown error, so callers render a
 *  message instead of needing a try/catch. */
export type ChangePasswordResult = { status: "ok" } | { status: "error"; message: string };

/**
 * Change the signed-in user's own password. Goes straight to Cognito from the browser — there is no
 * backend involved, and the current password is required, so this cannot be used to take over a
 * session someone else left open.
 *
 * Until this existed, the ONLY way a password was ever set was the NEW_PASSWORD_REQUIRED challenge
 * at first login; after that a reset meant an admin running an AWS CLI command.
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  try {
    await updatePassword({ oldPassword, newPassword });
    return { status: "ok" };
  } catch (err) {
    // The shared humanizer is written for the LOGIN form, where a rejected credential is reported as
    // "Incorrect username or password". On a change-password form there is no username field, so
    // that wording sends people looking for a problem that isn't there — here the same error can
    // only mean the current password was wrong.
    const name = (err as { name?: string })?.name ?? "";
    if (name === "NotAuthorizedException") {
      return { status: "error", message: "That current password isn't right." };
    }
    return { status: "error", message: humanizeAuthError(err) };
  }
}

/** Sign the current user out (clears the in-memory tokens). */
export async function signOutUser(): Promise<void> {
  await signOut();
}

/** Turn an Amplify auth error into a user-facing message. */
function humanizeAuthError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  switch (name) {
    case "NotAuthorizedException":
      return "Incorrect username or password.";
    case "UserNotFoundException":
      return "Incorrect username or password.";
    case "InvalidPasswordException":
      return "That password doesn't meet the requirements.";
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return (err as { message?: string })?.message ?? "Something went wrong. Please try again.";
  }
}
