// Minimal structural types for the API Gateway HTTP API (payload v2) event + response. Typed
// locally (like the auth contract) so this layer has no dependency on `@types/aws-lambda` and
// never needs an edit to the shared backend package.json. The shapes are a subset of the real
// AWS types — compatible with the actual event a Lambda receives behind a Cognito JWT authorizer.

/** The HTTP API v2 request event (subset we use). */
export interface ApiEvent {
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  pathParameters?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext: {
    http: {
      method: string;
      path: string;
    };
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
  };
}

/** The HTTP API v2 structured response. */
export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
}

/** The AWS Lambda handler signature for this API. */
export type LambdaHandler = (event: ApiEvent) => Promise<ApiResponse>;
