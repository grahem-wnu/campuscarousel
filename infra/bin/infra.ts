#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { getEnvConfig, getGlobalConfig, type Stage } from "../lib/config";
import { DataStack } from "../lib/data-stack";
import { AuthStack } from "../lib/auth-stack";
import { AssetsStack } from "../lib/assets-stack";
import { AsyncStack } from "../lib/async-stack";
import { ApiStack } from "../lib/api-stack";
import { WebStack } from "../lib/web-stack";
import { DnsStack } from "../lib/dns-stack";
import { CicdStack } from "../lib/cicd-stack";
import { ObservabilityStack } from "../lib/observability-stack";

const app = new App();

const stages: Stage[] = ["staging", "prod"];
const id = (name: string, stage: string) => `KeirasJourney-${name}-${stage}`;

// --- Account-global CI/CD: OIDC provider + scoped deploy roles + account budget.
// Created ONCE (not per-env): dev -> staging deploy role, main -> prod deploy role.
const globalCfg = getGlobalConfig(app);
const cicd = new CicdStack(app, "KeirasJourney-Cicd", {
  env: { account: globalCfg.account, region: globalCfg.region },
  config: globalCfg,
  deployTargets: [
    { stage: "staging", branch: "dev" },
    { stage: "prod", branch: "main" },
  ],
});
Tags.of(cicd).add("project", globalCfg.project);
Tags.of(cicd).add("scope", "global");
Tags.of(cicd).add("managedBy", "cdk");

for (const stage of stages) {
  const cfg = getEnvConfig(app, stage);
  const env = { account: cfg.account, region: cfg.region };

  // --- Optional DNS (Gate-1 domain decision). Undefined when deferred. ---
  // CloudFront requires its ACM cert in us-east-1, but these stacks run in us-east-2, so the
  // DnsStack (cert + zone import) is pinned to us-east-1. The us-east-2 WebStack consumes that
  // cert across regions, so both stacks opt into crossRegionReferences (CDK shares the ARN via
  // SSM-backed exports). Route53 is global, so the imported zone works from either region.
  const dns =
    cfg.dnsMode === "defer"
      ? undefined
      : new DnsStack(app, id("Dns", stage), {
          env: { account: cfg.account, region: "us-east-1" },
          crossRegionReferences: true,
          config: cfg,
        });

  // --- Stateful / foundational ---
  const data = new DataStack(app, id("Data", stage), { env, config: cfg });
  const auth = new AuthStack(app, id("Auth", stage), { env, config: cfg });

  // --- Assets (private media S3 + CloudFront OAC) for campus photos + logos ---
  const assets = new AssetsStack(app, id("Assets", stage), { env, config: cfg });

  // --- Async (SQS + DLQ + workers): text hydration + parallel imagery fetch ---
  const asyncStack = new AsyncStack(app, id("Async", stage), {
    env,
    config: cfg,
    table: data.table,
    assetsBucket: assets.bucket,
    assetsBaseUrl: assets.baseUrl,
  });

  // --- API (HTTP API + JWT authorizer + routing Lambda) ---
  const api = new ApiStack(app, id("Api", stage), {
    env,
    config: cfg,
    table: data.table,
    documentsBucket: data.documentsBucket,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    hydrationQueue: asyncStack.hydrationQueue,
    assetsQueue: asyncStack.assetsQueue,
    focusQueue: asyncStack.focusQueue,
    essayCoachQueue: asyncStack.essayCoachQueue,
  });

  // --- Web (private S3 + CloudFront OAC) ---
  // crossRegionReferences lets this us-east-2 stack consume the us-east-1 ACM cert from DnsStack.
  const web = new WebStack(app, id("Web", stage), {
    env,
    crossRegionReferences: true,
    config: cfg,
    certificate: dns?.certificate,
    hostedZone: dns?.hostedZone,
  });

  // --- Observability (log group + alarms + dashboard) ---
  const obs = new ObservabilityStack(app, id("Observability", stage), {
    env,
    config: cfg,
    apiName: api.httpApiName,
    apiId: api.apiId,
    routingFunctionName: api.routingFunctionName,
    workerFunctionName: asyncStack.workerFunctionName,
    distributionId: web.distributionId,
  });

  // Stack-level dependencies for clean deploy ordering.
  asyncStack.addDependency(data);
  asyncStack.addDependency(assets); // worker writes to the media bucket + reads its CDN base url
  api.addDependency(data);
  api.addDependency(auth);
  api.addDependency(asyncStack);
  obs.addDependency(api);
  obs.addDependency(web);
  if (dns) web.addDependency(dns);

  // Consistent tags across every resource in the env.
  for (const s of [dns, data, auth, assets, asyncStack, api, web, obs]) {
    if (s) {
      Tags.of(s).add("project", cfg.project);
      Tags.of(s).add("stage", stage);
      Tags.of(s).add("managedBy", "cdk");
    }
  }
}

app.synth();
