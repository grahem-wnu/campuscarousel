import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

/** Minimal shape needed to place an output — works for env and global configs. */
export interface SsmTarget {
  readonly ssmPrefix: string;
  readonly stage?: string;
}

/**
 * Writes a non-secret stack output to SSM Parameter Store under the env prefix
 * (`/keiras-journey/<stage>/<name>`, or `/keiras-journey/global/<name>` for
 * account-global resources). Workers and the frontend build read config from here
 * instead of hardcoding it. These are plain (non-secret) values only — never write
 * secrets to plaintext SSM.
 */
export function putOutput(
  scope: Construct,
  cfg: SsmTarget,
  name: string,
  value: string,
  description?: string,
): StringParameter {
  return new StringParameter(scope, `Param-${name.replace(/[^A-Za-z0-9]/g, "-")}`, {
    parameterName: `${cfg.ssmPrefix}/${name}`,
    stringValue: value,
    description: description ?? `keiras-journey ${cfg.stage ?? "global"} ${name}`,
  });
}
