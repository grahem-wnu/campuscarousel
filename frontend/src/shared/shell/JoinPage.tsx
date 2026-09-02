// Public SIGN-UP page for an admin-issued invite (/join?code=…). Rendered by AuthGate OUTSIDE the auth
// wall — the invited family has no account yet. Posts to the public, unauthenticated POST /auth/redeem
// (the api client omits the Authorization header when there's no session), which provisions a brand-new
// family tenant + the parent's login (username = their email). On success we sign them straight in —
// same pattern as JoinFamilyPage: swap the URL via replaceState and let AuthGate re-render into the app.
//
// "Already signed up" is detected two ways — deliberately WITHOUT a "does this email exist" endpoint,
// which would be a user-enumeration hole: (1) a live session in this browser → a notice instead of the
// form; (2) the backend answers 409 for an email that already has a login → straight to /login with the
// username filled in.
//
// Distinct from JoinFamilyPage (/join-family), which joins an EXISTING family (co-parent / student).

import { useState } from "react";
import { api } from "../api";
import { ApiError } from "../api/types";
import { Button, Card, Field, Input, Spinner, useToast } from "../ui";
import { startSignIn } from "./amplify";
import { useAuth } from "./AuthContext";
import { goToLoginWithHint } from "./loginHint";

function codeFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("code") ?? "";
}

const SIGN_IN_LINK =
  "font-medium text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300";

export function JoinPage() {
  const toast = useToast();
  const { status, user, refresh, signOut } = useAuth();
  const [code, setCode] = useState(codeFromUrl());
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Account created but the automatic sign-in didn't complete → offer manual sign-in.
  const [created, setCreated] = useState(false);

  async function submit() {
    const trimmedEmail = email.trim();
    if (!code.trim() || !trimmedEmail || password.length < 8) {
      toast.error("Enter your invite code, your email, and a password of at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/redeem", {
        code: code.trim(),
        email: trimmedEmail,
        password,
        familyName: familyName.trim() || undefined,
      });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 409) {
        // This email already has a login — nothing to create. Send them to sign in instead.
        goToLoginWithHint({ username: trimmedEmail, note: "You already have an account — sign in below." });
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not create your account.");
      return;
    }
    // The login now exists. Sign in straight away so they land in the app without retyping anything.
    const result = await startSignIn(trimmedEmail, password);
    if (result.status === "done") {
      window.history.replaceState(null, "", "/");
      await refresh();
      return;
    }
    // Provisioned but couldn't auto-sign-in (unexpected challenge) — fall back to manual sign-in.
    setSubmitting(false);
    setCreated(true);
  }

  async function signOutToRedeem() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      toast.error("Couldn't sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  // Don't flash the form at someone who turns out to be signed in.
  if (status === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center bg-surface-base text-primary-600">
        <Spinner size={28} />
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div className="flex min-h-full items-center justify-center bg-surface-base p-4">
        <Card className="w-full max-w-md space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-ink-900">You're already signed in</h1>
            <p className="text-sm text-ink-600">
              Signed in as <span className="font-medium text-ink-800">{user?.username}</span>.
            </p>
          </div>
          <p className="text-sm leading-relaxed text-ink-600">
            Invite links create a new family account. If this invite is for you, you already have one —
            head into the app. If it's for someone else, sign out first and they can use it here.
          </p>
          <div className="flex flex-col gap-2">
            <Button block onClick={() => window.location.assign("/")}>
              Go to the app
            </Button>
            <Button block variant="outline" loading={signingOut} onClick={() => void signOutToRedeem()}>
              Sign out to use this invite
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface-base p-4">
      <Card className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink-900">{created ? "Your account is ready" : "Create your account"}</h1>
          <p className="text-sm text-ink-600">
            {created
              ? "Sign in with your email and the password you just chose."
              : "You've been invited to Campus Carousel. Set up your family's account with the code from your invite."}
          </p>
        </div>

        {created ? (
          <Button
            block
            onClick={() =>
              goToLoginWithHint({
                username: email.trim(),
                note: "Your account is ready — sign in with the password you just chose.",
              })
            }
          >
            Go to sign in
          </Button>
        ) : (
          <div className="space-y-3">
            <Field label="Invite code">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD2345" autoCapitalize="characters" />
            </Field>
            <Field label="Your email" hint="This will be your username.">
              <Input
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="parent@example.com"
              />
            </Field>
            <Field label="Family name (optional)">
              <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
            </Field>
            <Field label="Choose a password" hint="At least 8 characters.">
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button block loading={submitting} onClick={() => void submit()}>
              Create account
            </Button>
            <p className="pt-1 text-center text-sm text-ink-500">
              Already have an account?{" "}
              <a href="/login" className={SIGN_IN_LINK}>
                Sign in
              </a>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
