// Privacy enforcement (frozen contract). This is the single source of truth for the rule that
// every visibility-bearing module obeys:
//
//   `private` entries (journal, clinical-hours, why-nursing) are visible ONLY to the student
//   (Keira) — hidden from the parent and the admin — while the AI path receives ALL entries,
//   including private, when the student is the authenticated caller.
//
// Enforcement is server-side, off the JWT-derived `Requester`. Never trust a client-supplied
// filter. Modules MUST route every read of visibility-bearing data through these helpers.

import type { Requester, Visible } from './types.js';
import { ForbiddenError } from './errors.js';

/**
 * Whether the caller may see `private` entries. Only the student can; private entries are hidden
 * from the parent and admin (an admin is privileged for account management, NOT for reading
 * Keira's private reflections). Keyed on the JWT role, so there is no hardcoded username.
 */
export function canSeePrivate(requester: Requester): boolean {
  return requester.role === 'student';
}

function isPrivate(item: Visible): boolean {
  return item.visibility === 'private';
}

/**
 * Filter a list for a normal read: drop `private` entries unless the caller is the student.
 * Entries without a `visibility` field are family-visible and always kept.
 */
export function filterForRequester<T extends Visible>(items: readonly T[], requester: Requester): T[] {
  if (canSeePrivate(requester)) return [...items];
  return items.filter((item) => !isPrivate(item));
}

/**
 * Guard a fetch-by-id: throw `ForbiddenError` (403) if a non-student tries to read a `private`
 * entry directly. Use this on the read-one path so a parent can't fetch a private entry by id.
 */
export function assertCanRead(item: Visible, requester: Requester): void {
  if (isPrivate(item) && !canSeePrivate(requester)) {
    throw new ForbiddenError('This entry is private');
  }
}

/**
 * The set of entries the AI may use for this caller: ALL entries (including private) when the
 * student is the authenticated caller, otherwise family-only. This is what lets the AI help Keira
 * with essays/interviews using her private writing while never exposing it to the parent or admin.
 */
export function aiVisibleSet<T extends Visible>(items: readonly T[], requester: Requester): T[] {
  if (canSeePrivate(requester)) return [...items];
  return items.filter((item) => !isPrivate(item));
}
