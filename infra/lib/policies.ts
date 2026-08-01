import { PolicyStatement } from "aws-cdk-lib/aws-iam";

/**
 * Least-privilege Bedrock invoke permission for the AI Lambdas (routing + worker).
 *
 * Grants only InvokeModel + InvokeModelWithResponseStream, scoped to:
 *   - the inference profile the app actually calls, and
 *   - the underlying Sonnet foundation models the profile fans out to (region-wildcarded,
 *     since a cross-region profile dispatches to several regions).
 *
 * PROFILE ARN SHAPES DIFFER. A geo-scoped profile (`us.`/`eu.`/`apac.`) is an account-owned resource
 * — `arn:aws:bedrock:<region>:<account>:inference-profile/<id>`. A `global.` profile is AWS-owned and
 * carries NO account id — `arn:aws:bedrock:<region>::inference-profile/<id>`. Both forms are granted
 * so switching `bedrockSonnetProfile` between them needs no IAM change; the account-scoped ARN alone
 * would deny every call once the global profile is selected.
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
      `arn:aws:bedrock:*::inference-profile/${inferenceProfileId}`,
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
 * Cost Explorer read for the reconciliation Lambda (Phase 2B). `ce:GetCostAndUsage` is a global,
 * resource-less action — Cost Explorer exposes no resource ARNs — so `*` is the ONLY valid resource
 * (this is the documented exception, not an over-grant).
 */
export function costExplorerReadStatement(): PolicyStatement {
  return new PolicyStatement({
    sid: "ReadBedrockCost",
    actions: ["ce:GetCostAndUsage"],
    resources: ["*"], // Cost Explorer has no resource-level ARNs.
  });
}

/**
 * Read the Bedrock model-invocation-log bucket (Phase 2B). GetObject on the objects + ListBucket on
 * the bucket itself, scoped to exactly this bucket.
 */
export function s3ReadStatement(bucketArn: string): PolicyStatement {
  return new PolicyStatement({
    sid: "ReadInvocationLogs",
    actions: ["s3:GetObject", "s3:ListBucket"],
    resources: [bucketArn, `${bucketArn}/*`],
  });
}

/**
 * Publish drift alerts to the ObservabilityStack alarm SNS topic (Phase 2B). Scoped to the one topic.
 */
export function snsPublishStatement(topicArn: string): PolicyStatement {
  return new PolicyStatement({
    sid: "PublishDriftAlert",
    actions: ["sns:Publish"],
    resources: [topicArn],
  });
}

/**
 * Emit reconciliation gauges to CloudWatch (Phase 2B). `cloudwatch:PutMetricData` is a resource-less
 * action (no metric ARNs) — `*` is the only valid resource; access is instead constrained by the
 * `cloudwatch:namespace` condition in practice. Documented exception, not an over-grant.
 */
export function cloudwatchPutMetricStatement(): PolicyStatement {
  return new PolicyStatement({
    sid: "PutMeteringMetrics",
    actions: ["cloudwatch:PutMetricData"],
    resources: ["*"], // PutMetricData has no resource-level ARNs.
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
