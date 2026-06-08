import type { App, Environment } from "aws-cdk-lib";

/**
 * Stage identifiers. Two environments per the foundational infra spec.
 */
export type Stage = "staging" | "prod";

/**
 * How the DnsStack should behave for an environment (the Gate-1 domain decision).
 * - "defer"   : no Route53/ACM; serve on the CloudFront default *.cloudfront.net domain.
 * - "import"  : a hosted zone for domainName already exists in this account; import it
 *               (id supplied via context `hostedZoneId` — no live lookup).
 * - "create"  : create a new public hosted zone (assumes the domain registration / NS
 *               delegation is handled out-of-band or via Route53 domain registration).
 *
 * Default is "defer" so `cdk synth` never needs a live account/zone lookup.
 */
export type DnsMode = "defer" | "import" | "create";

export interface EnvConfig {
  readonly stage: Stage;
  readonly account: string;
  readonly region: string;
  /** Project slug, e.g. "keiras-journey". */
  readonly project: string;
  /** Bare apex domain, e.g. "keirasjourney.com". */
  readonly domainName: string;
  /** Optional subdomain prefix for this env, e.g. "staging" -> staging.keirasjourney.com. */
  readonly subdomain: string;
  readonly dnsMode: DnsMode;
  /** "retain" for prod data safety, "destroy" for ephemeral staging. */
  readonly removalPolicy: "retain" | "destroy";
  /** GitHub org/repo allowed to assume the CI deploy role via OIDC. */
  readonly githubOrg: string;
  readonly githubRepo: string;
  /** Bedrock cross-region inference profile id for the AI Lambda role. */
  readonly bedrockSonnetProfile: string;
  /** SSM parameter prefix for all stack outputs, e.g. /keiras-journey/staging. */
  readonly ssmPrefix: string;
  /** Resource name prefix, e.g. "keiras-journey-staging". */
  readonly namePrefix: string;
}

/**
 * Account-global config for resources that exist once per account (OIDC, deploy roles,
 * the account budget) rather than once per env. Outputs land under /<project>/global.
 */
export interface GlobalConfig {
  readonly account: string;
  readonly region: string;
  readonly project: string;
  readonly githubOrg: string;
  readonly githubRepo: string;
  readonly ssmPrefix: string;
  readonly namePrefix: string;
}

/**
 * The CDK environment (account + region) for synth/deploy.
 *
 * Resolution order (no hardcoded account IDs committed to source):
 *   1. CDK context `account`/`region` (set via -c or cdk.json at deploy time)
 *   2. CDK_DEPLOY_ACCOUNT / CDK_DEPLOY_REGION env vars
 *   3. CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION (populated by the CDK CLI from creds)
 *
 * For pure `cdk synth` with no creds, account falls back to a synth-only placeholder so
 * environment-agnostic templates still synthesize without any AWS lookup. A real deploy
 * supplies the wnu account (010928187255) via the active profile — that value never
 * appears in source.
 */
function resolveEnv(app: App): Required<Environment> {
  const ctxAccount = app.node.tryGetContext("account") as string | undefined;
  const ctxRegion = app.node.tryGetContext("region") as string | undefined;

  const account =
    ctxAccount ||
    process.env.CDK_DEPLOY_ACCOUNT ||
    process.env.CDK_DEFAULT_ACCOUNT ||
    "000000000000"; // synth-only placeholder; real deploys inject the wnu account from creds.

  const region =
    ctxRegion ||
    process.env.CDK_DEPLOY_REGION ||
    process.env.CDK_DEFAULT_REGION ||
    "us-east-2";

  return { account, region };
}

function project(app: App): string {
  return (app.node.tryGetContext("project") as string) || "keiras-journey";
}

function github(app: App): { org: string; repo: string } {
  return {
    org: (app.node.tryGetContext("githubOrg") as string) || "grahem-wnu",
    repo: (app.node.tryGetContext("githubRepo") as string) || "keiras-journey",
  };
}

export function getEnvConfig(app: App, stage: Stage): EnvConfig {
  const { account, region } = resolveEnv(app);
  const proj = project(app);
  const { org, repo } = github(app);

  const domainName = (app.node.tryGetContext("domainName") as string) || "keirasjourney.com";
  const bedrockSonnetProfile =
    (app.node.tryGetContext("bedrockSonnetProfile") as string) ||
    "us.anthropic.claude-sonnet-4-20250514-v1:0";

  const envs = (app.node.tryGetContext("envs") as Record<string, Partial<EnvConfig>>) || {};
  const envCtx = envs[stage] || {};

  const dnsMode = (envCtx.dnsMode as DnsMode) || "defer";
  const subdomain =
    envCtx.subdomain !== undefined ? envCtx.subdomain : stage === "prod" ? "" : "staging";
  const removalPolicy =
    (envCtx.removalPolicy as "retain" | "destroy") || (stage === "prod" ? "retain" : "destroy");

  return {
    stage,
    account,
    region,
    project: proj,
    domainName,
    subdomain,
    dnsMode,
    removalPolicy,
    githubOrg: org,
    githubRepo: repo,
    bedrockSonnetProfile,
    ssmPrefix: `/${proj}/${stage}`,
    namePrefix: `${proj}-${stage}`,
  };
}

export function getGlobalConfig(app: App): GlobalConfig {
  const { account, region } = resolveEnv(app);
  const proj = project(app);
  const { org, repo } = github(app);
  return {
    account,
    region,
    project: proj,
    githubOrg: org,
    githubRepo: repo,
    ssmPrefix: `/${proj}/global`,
    namePrefix: proj,
  };
}

/** Full hostname for an env, e.g. staging.keirasjourney.com or keirasjourney.com. */
export function envHostname(cfg: EnvConfig): string {
  return cfg.subdomain ? `${cfg.subdomain}.${cfg.domainName}` : cfg.domainName;
}
