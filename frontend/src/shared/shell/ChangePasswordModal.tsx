// Change-password dialog, opened from the account menu.
//
// Until this existed there was no way for a signed-in person to change their own password: the only
// place one was ever set was the NEW_PASSWORD_REQUIRED challenge at first login, and after that a
// reset meant an admin running an AWS CLI command. The pool has no email recovery
// (`AccountRecovery.NONE`), so this is the only self-service path there is.
//
// Goes straight to Cognito from the browser — no backend, no new endpoint. The current password is
// required, so someone who wanders up to an unattended laptop still can't lock the owner out.

import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input, Modal } from "../ui";
import { changePassword } from "./amplify";

/** Mirrors the Cognito pool policy (minLength 6, no character-class requirements). Kept in step with
 *  infra/lib/auth-stack.ts — a stricter rule here would reject passwords Cognito would accept and
 *  leave the person with no way to tell which rule they broke. */
const MIN_LENGTH = 6;

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Never leave a typed password sitting in state behind a closed dialog.
  useEffect(() => {
    if (open) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setDone(false);
    setSubmitting(false);
  }, [open]);

  /** Local checks first, so the obvious mistakes don't cost a round trip to Cognito. */
  function localProblem(): string | null {
    if (next.length < MIN_LENGTH) return `Your new password needs at least ${MIN_LENGTH} characters.`;
    if (next !== confirm) return "Those two new passwords don't match.";
    if (next === current) return "That's the same as your current password.";
    return null;
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const problem = localProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await changePassword(current, next);
    setSubmitting(false);
    if (result.status === "ok") setDone(true);
    else setError(result.message);
  }

  const ready = current.length > 0 && next.length > 0 && confirm.length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Change password" size="sm">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            Your password has been changed. You&rsquo;ll use the new one next time you sign in.
          </p>
          <Button block onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              aria-label="Current password"
            />
          </Field>
          <Field label="New password" hint={`At least ${MIN_LENGTH} characters.`}>
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-label="New password"
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-label="Confirm new password"
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-error-600">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" block onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" block loading={submitting} disabled={!ready}>
              Change password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
