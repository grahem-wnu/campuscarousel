// One-shot "sign in as …" hint handed from the public sign-up page (/join) to the login page.
//
// When someone redeems an invite with an email that already has an account (or their account was just
// created but auto sign-in didn't complete), we send them to /login and want the username filled in —
// plus a line saying why they're there — so they only type a password. sessionStorage keeps the email
// out of the URL and dies with the tab. Every access is guarded: private/locked-down browsers can throw
// on the storage accessor itself.
//
// Split into peek + clear (rather than a single "take") because the login page reads the hint in a
// state initializer and clears it in a mount effect — React StrictMode runs both twice in dev, and a
// read-and-clear initializer would come back empty the second time.

const KEY = "cc.loginHint";

export interface LoginHint {
  /** Username to prefill (for an invited parent this is their email). */
  username: string;
  /** Optional one-line explanation shown above the sign-in form. */
  note?: string;
}

/** Remember a hint for the next visit to the login page (overwrites any pending one). */
export function rememberLoginHint(hint: LoginHint): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(hint));
  } catch {
    // Storage unavailable — the login page simply starts empty.
  }
}

/** Read the pending hint without consuming it; null when there is none (or it is unreadable). */
export function peekLoginHint(): LoginHint | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LoginHint>;
    if (typeof parsed.username !== "string") return null;
    return { username: parsed.username, ...(typeof parsed.note === "string" ? { note: parsed.note } : {}) };
  } catch {
    return null;
  }
}

/** Forget the pending hint (the login page calls this once it has been shown). */
export function clearLoginHint(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Hand off to the login page with the hint in place. A full navigation on purpose: /login is served by
 * AuthGate outside the router, and the sign-up page has nothing to keep.
 */
export function goToLoginWithHint(hint: LoginHint): void {
  rememberLoginHint(hint);
  window.location.assign("/login");
}
