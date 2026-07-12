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

/**
 * Read access to this env's SSM config prefix (e.g. `/keiras-journey/staging/*`) — runtime config
 * plus the Tavily `tavilyApiKey` SecureString. WithDecryption on a SecureString backed by the
 * AWS-managed `alias/aws/ssm` key needs only `ssm:GetParameter` (SSM performs the decrypt; no extra
 * `kms:Decrypt` grant required). If a customer-managed CMK is ever used instead, add a kms:Decrypt
 * statement scoped to that key.
 */
export function ssmReadConfigStatement(
  region: string,
  account: string,
  ssmPrefix: string,
): PolicyStatement {
  return new PolicyStatement({
    sid: "ReadEnvConfig",
    actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
    resources: [`arn:aws:ssm:${region}:${account}:parameter${ssmPrefix}/*`],
  });
}

/**
 * Least-privilege SES send permission for the reminder-digest Lambda (v2.1 F1). Scoped to SES
 * identities in this account/region (the verified sender); no wildcard resource beyond the identity
 * namespace. `ses:SendEmail` is the IAM action for both the v1 and v2 SendEmail APIs.
 */
export function sesSendStatement(region: string, account: string): PolicyStatement {
  return new PolicyStatement({
    sid: "SendReminderDigest",
    actions: ["ses:SendEmail"],
    resources: [`arn:aws:ses:${region}:${account}:identity/*`],
  });
}
