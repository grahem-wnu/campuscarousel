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

/** App-wide API client. Throws {@link ApiError} on any non-2xx response. */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  getToken: amplifyTokenProvider,
});
