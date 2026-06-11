/**
 * Public API surface for the data client. Modules import `{ api }` (and the typed
 * error helpers) from here. The default singleton is wired to Amplify for the bearer
 * token and to `VITE_API_BASE_URL` for the host.
 */
import { fetchAuthSession } from "aws-amplify/auth";
import { createApiClient, type TokenProvider } from "./client";

export * from "./types";
export { createApiClient } from "./client";
export type { ApiClient, ApiClientConfig, RequestOptions, TokenProvider } from "./client";

/** Pull the current Cognito ID token from Amplify; null when signed out. */
const amplifyTokenProvider: TokenProvider = async () => {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
};

// Multi-student: the active student id the API client stamps onto each request as `X-Student-Id`.
// Held in a module-level ref so the singleton `api` (created once) always reads the latest value;
// the ActiveStudentProvider updates it via setActiveStudentId whenever the user switches kids.
let activeStudentId: string | null = null;

/** Set the active student id sent on subsequent requests (called by the ActiveStudentProvider). */
export function setActiveStudentId(studentId: string | null): void {
  activeStudentId = studentId;
}

/** App-wide API client. Throws {@link ApiError} on any non-2xx response. */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  getToken: amplifyTokenProvider,
  getStudentId: () => activeStudentId,
});
