/// <reference types="vite/client" />

// Typed runtime configuration. All values are injected at build time from the
// environment (CI/CD reads them from SSM `/keiras-journey/<env>/...`). No secrets:
// the Cognito app client has no secret, and pool/client ids are public by design.
interface ImportMetaEnv {
  /** AWS region for Cognito + API (e.g. "us-east-2"). */
  readonly VITE_AWS_REGION: string;
  /** Cognito User Pool id. */
  readonly VITE_USER_POOL_ID: string;
  /** Cognito User Pool app client id (SPA client, no secret). */
  readonly VITE_USER_POOL_CLIENT_ID: string;
  /** Base URL of the HTTP API (API Gateway), no trailing slash. */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
