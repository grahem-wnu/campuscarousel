// Shared identity & visibility types (frozen contract).
//
// The API handler context's `requester` uses this exact shape (see specs/foundational/api.md),
// and the data layer's visibility-bearing entities (journal, clinical-hours, why-nursing) carry
// the `visibility` field defined here.

export type Role = 'admin' | 'parent' | 'student';

/** The authenticated caller, resolved from the validated Cognito JWT. */
export interface Requester {
  username: string;
  role: Role;
}

export type Visibility = 'family' | 'private';

/**
 * Any entity that may be marked `private`. An entity with no `visibility` field is treated as
 * family-visible. Only journal, clinical-hours, and why-nursing entries are visibility-bearing
 * per the spec, but the middleware is generic so any such entity can be filtered uniformly.
 */
export interface Visible {
  visibility?: Visibility;
}
