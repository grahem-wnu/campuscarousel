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
}

function parseRole(claim: unknown): Role {
  return claim === "admin" || claim === "parent" || claim === "student" ? claim : "student";
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
    return { username, role: parseRole(claims["custom:role"]) };
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
