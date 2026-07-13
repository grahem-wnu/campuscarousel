// Shared constants for College Hub, kept in their own module to avoid import cycles.
// `HYDRATION_TYPE` lives here (not in hydration.ts) so that bucket-ai.ts can import it without
// creating a cycle (hydration.ts imports runBucketJob from bucket-ai.ts).

/** SQS message `type` discriminator for the shared College Hub async queue. */
export const HYDRATION_TYPE = 'college-hydrate';
