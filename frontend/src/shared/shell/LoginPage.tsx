import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { TextField } from "../ui/Field";
import { useAuth } from "./AuthContext";
import { completeNewPassword, startSignIn } from "./amplify";

type Phase = "credentials" | "new_password";

/**
 * Login screen. Username + password (no email). Handles the first-login
 * NEW_PASSWORD_REQUIRED challenge by prompting for a new password, then refreshes
 * the auth state so the shell takes over.
 */
export function LoginPage() {
  const { refresh } = useAuth();
  const [phase, setPhase] = useState<Phase>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await startSignIn(username.trim(), password);
    setSubmitting(false);
    if (result.status === "done") {
      await refresh();
    } else if (result.status === "new_password_required") {
      setPassword("");
      setPhase("new_password");
    } else {
      setError(result.message);
    }
  }

  async function onSubmitNewPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const result = await completeNewPassword(newPassword);
    setSubmitting(false);
    if (result.status === "done") {
      await refresh();
    } else if (result.status === "error") {
      setError(result.message);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-surface-base px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink-900">
            Campus <span className="text-primary-700">Carousel</span>
          </h1>
          <p className="mt-2 font-display text-base text-ink-600">
            {phase === "credentials" ? "The story of the journey, kept well." : "Choose a new password"}
          </p>
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-raised p-6 shadow-md">
          {phase === "credentials" ? (
            <form onSubmit={onSubmitCredentials} className="flex flex-col gap-4">
              <TextField
                label="Username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error ? <p className="text-sm text-error-600">{error}</p> : null}
              <Button type="submit" block loading={submitting} disabled={!username || !password}>
                Sign in
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmitNewPassword} className="flex flex-col gap-4">
              <p className="text-sm text-ink-600">
                This is your first sign-in. Please set a new password.
              </p>
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <TextField
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {error ? <p className="text-sm text-error-600">{error}</p> : null}
              <Button type="submit" block loading={submitting} disabled={!newPassword || !confirmPassword}>
                Set password &amp; continue
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          Password help? Ask Grahem &mdash; resets are handled by the admin.
        </p>
      </div>
    </div>
  );
}
