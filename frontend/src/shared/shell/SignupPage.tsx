// Public open-signup page: anyone with the site URL can create a family account — no invite, no
// email verification (docs/superpowers/specs/2026-07-04-public-signup-design.md). Rendered by
// AuthGate for /signup, OUTSIDE the auth wall, calling the public POST /auth/signup. On success we
// sign the new parent straight in; tokens live in memory only, so we must NOT hard-navigate after
// signIn — we swap the URL via replaceState and let AuthGate re-render into the app (where the
// onboarding chat takes over for the empty new family).

import { useState } from "react";
import { api } from "../api";
import { Button, Card, Field, Input, useToast } from "../ui";
import { startSignIn } from "./amplify";
import { useAuth } from "./AuthContext";

export function SignupPage() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Account created but the automatic sign-in didn't complete → offer manual sign-in.
  const [created, setCreated] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 8) {
      toast.error("Enter your email and a password of at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/signup", {
        email: email.trim(),
        password,
        familyName: familyName.trim() || undefined,
      });
      const result = await startSignIn(email.trim(), password);
      if (result.status === "done") {
        window.history.replaceState(null, "", "/");
        await refresh();
        return;
      }
      setCreated(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create your account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface-base p-4">
      <Card className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink-900">Campus Carousel</h1>
          <p className="text-sm text-ink-600">
            {created ? "You're all set." : "Create your family account."}
          </p>
        </div>

        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              Your account is ready. Sign in with your email and the password you just chose.
            </p>
            <Button block onClick={() => { window.location.href = "/"; }}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Your email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@example.com" />
            </Field>
            <Field label="Family name (optional)">
              <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
            </Field>
            <Field label="Choose a password" hint="At least 8 characters.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button block loading={submitting} onClick={() => void submit()}>
              Create account
            </Button>
            <p className="text-center text-xs text-ink-500">
              Already have an account?{" "}
              <a href="/" className="font-medium text-primary-700 hover:underline">
                Sign in
              </a>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
