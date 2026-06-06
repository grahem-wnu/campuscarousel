#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { getEnvConfig, getGlobalConfig, type Stage } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { AuthStack } from "../lib/auth-stack.js";
import { AsyncStack } from "../lib/async-stack.js";
import { ApiStack } from "../lib/api-stack.js";
import { WebStack } from "../lib/web-stack.js";
import { DnsStack } from "../lib/dns-stack.js";
import { CicdStack } from "../lib/cicd-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";

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
  const dns =
    cfg.dnsMode === "defer" ? undefined : new DnsStack(app, id("Dns", stage), { env, config: cfg });

  // --- Stateful / foundational ---
  const data = new DataStack(app, id("Data", stage), { env, config: cfg });
  const auth = new AuthStack(app, id("Auth", stage), { env, config: cfg });

  // --- Async (SQS + DLQ + worker) ---
  const asyncStack = new AsyncStack(app, id("Async", stage), { env, config: cfg, table: data.table });

  // --- API (HTTP API + JWT authorizer + routing Lambda) ---
  const api = new ApiStack(app, id("Api", stage), {
    env,
    config: cfg,
    table: data.table,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    hydrationQueue: asyncStack.hydrationQueue,
  });

  // --- Web (private S3 + CloudFront OAC) ---
  const web = new WebStack(app, id("Web", stage), {
    env,
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
  api.addDependency(data);
  api.addDependency(auth);
  api.addDependency(asyncStack);
  obs.addDependency(api);
  obs.addDependency(web);
  if (dns) web.addDependency(dns);

  // Consistent tags across every resource in the env.
  for (const s of [dns, data, auth, asyncStack, api, web, obs]) {
    if (s) {
      Tags.of(s).add("project", cfg.project);
      Tags.of(s).add("stage", stage);
      Tags.of(s).add("managedBy", "cdk");
    }
  }
}

app.synth();
