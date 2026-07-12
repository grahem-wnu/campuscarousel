// Public accept-invite page. An invited co-parent, viewer, or STUDENT arrives here with a shareable
// code (?code=...), chooses their own login name + password, and joins an EXISTING family. Calls the
// public, unauthenticated POST /family/invites/accept (the api client omits the Authorization header
// when there's no session). On success we sign them straight in — tokens are memory-only, so we must
// NOT hard-navigate; we swap the URL via replaceState and let AuthGate re-render into the app (the
// student lands on her own dashboard; an adult on the family they joined).
//
// Distinct from JoinPage (/join), which redeems a front-door code to create a WHOLE NEW family.

import { useState } from "react";
import { api } from "../api";
import { Button, Card, Field, Input, useToast } from "../ui";
import { startSignIn } from "./amplify";
import { useAuth } from "./AuthContext";

function codeFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("code") ?? "";
}

export function JoinFamilyPage() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [code, setCode] = useState(codeFromUrl());
  const [loginName, setLoginName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Account created but the automatic sign-in didn't complete → offer manual sign-in.
  const [created, setCreated] = useState(false);

  async function submit() {
    if (!code.trim() || !loginName.trim() || password.length < 8) {
      toast.error("Enter your invite code, a login name, and a password of at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/family/invites/accept", {
        code: code.trim(),
        loginName: loginName.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
      // The login now exists. Sign in straight away (memory-only tokens ⇒ no hard navigation).
      const result = await startSignIn(loginName.trim(), password);
      if (result.status === "done") {
        window.history.replaceState(null, "", "/");
        await refresh();
        return;
      }
      // Provisioned but couldn't auto-sign-in (unexpected challenge) — fall back to manual sign-in.
      setCreated(true);
    } catch (err) {
      // On a recoverable failure (e.g. the chosen login name is taken) the backend rolls the code back
      // to pending, so the invitee can simply fix the name and retry — no re-invite needed.
      toast.error(err instanceof Error ? err.message : "Could not accept the invite. Check your code and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface-base p-4">
      <Card className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink-900">Join the family</h1>
          <p className="text-sm text-ink-600">
            {created ? "You're all set." : "Set up your login with the code from your invite."}
          </p>
        </div>

        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-700">
              Your login is ready. Sign in with the login name and password you just chose.
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
            <Field label="Choose a login name" hint="This is what you'll sign in with — letters and numbers, no email needed.">
              <Input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="e.g. keira2030" autoCapitalize="none" />
            </Field>
            <Field label="Your name (optional)">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Keira" />
            </Field>
            <Field label="Choose a password" hint="At least 8 characters.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button block loading={submitting} onClick={() => void submit()}>
              Join &amp; sign in
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
