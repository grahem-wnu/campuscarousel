import { PolicyStatement } from "aws-cdk-lib/aws-iam";

/**
 * Least-privilege Bedrock invoke permission for the AI Lambdas (routing + worker).
 *
 * Grants only InvokeModel + InvokeModelWithResponseStream, scoped to:
 *   - the cross-region inference profile (the `us.` prefix the app actually calls), and
 *   - the underlying Sonnet foundation models the profile fans out to (region-wildcarded,
 *     since a cross-region profile dispatches to several regions).
 *
 * No wildcard action, no `*` resource. The model/profile id is injected (never hardcoded
 * in logic); see config.ts / cdk.json context.
 */
export function bedrockInvokeStatement(account: string, inferenceProfileId: string): PolicyStatement {
  return new PolicyStatement({
    sid: "BedrockInvokeSonnet",
    actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    resources: [
      `arn:aws:bedrock:*:${account}:inference-profile/${inferenceProfileId}`,
      `arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4*`,
    ],
  });
}
