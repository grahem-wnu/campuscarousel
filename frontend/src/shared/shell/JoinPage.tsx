// Public self-signup page (SaaS sub-project 2). Rendered by AuthGate for /join, OUTSIDE the auth wall —
// an invited family arrives here with a code, sets their own password, and gets an account. Calls the
// public, unauthenticated POST /auth/redeem (the api client omits the Authorization header when there's
// no session). On success they're sent to the sign-in page.

import { useState } from "react";
import { api } from "../api";
import { Button, Card, Field, Input, useToast } from "../ui";

function codeFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("code") ?? "";
}

export function JoinPage() {
  const toast = useToast();
  const [code, setCode] = useState(codeFromUrl());
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!code.trim() || !email.trim() || password.length < 8) {
      toast.error("Enter your code, email, and a password of at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/redeem", {
        code: code.trim(),
        email: email.trim(),
        password,
        familyName: familyName.trim() || undefined,
      });
      setDone(true);
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
          <h1 className="text-2xl font-bold text-ink-900">Keira's Journey</h1>
          <p className="text-sm text-ink-600">
            {done ? "You're all set." : "Create your family account with the code from your invite."}
          </p>
        </div>

        {done ? (
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
            <Field label="Invite code">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD2345" />
            </Field>
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
          </div>
        )}
      </Card>
    </div>
  );
}
