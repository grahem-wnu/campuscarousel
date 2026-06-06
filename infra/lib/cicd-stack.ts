import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import {
  Effect,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
} from "aws-cdk-lib/aws-iam";
import { Topic } from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";
import type { GlobalConfig } from "./config";
import { putOutput } from "./ssm";

export interface CicdStackProps extends StackProps {
  readonly config: GlobalConfig;
  /** Per-stage deploy targets: which git branch may deploy which stage. */
  readonly deployTargets: ReadonlyArray<{ stage: string; branch: string }>;
}

const GITHUB_OIDC_URL = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "sts.amazonaws.com";

/**
 * CicdStack — account-global (instantiated ONCE, not per-env).
 *
 * - GitHub OIDC provider (no long-lived AWS keys in CI).
 * - One scoped deploy role per stage, trust-restricted to a single branch of
 *   `${githubOrg}/${githubRepo}` (dev -> staging, main -> prod). Each role can only
 *   assume the CDK bootstrap execution roles in this account — the standard, scoped
 *   CDK-deploy permission model (no broad admin grant).
 * - An AWS Budgets alarm on the account to catch runaway Bedrock/compute during the
 *   autonomous build; notifies an SNS topic (+ optional email from context).
 */
export class CicdStack extends Stack {
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);
    const { config, deployTargets } = props;

    // GitHub's OIDC provider is account-global. Import it if it already exists
    // (the wnu account already has one); only create when context says to.
    const createOidc = this.node.tryGetContext("createGithubOidc") === true;
    const providerArn = createOidc
      ? new OpenIdConnectProvider(this, "GithubOidc", {
          url: GITHUB_OIDC_URL,
          clientIds: [GITHUB_OIDC_AUDIENCE],
        }).openIdConnectProviderArn
      : OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          "GithubOidc",
          `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
        ).openIdConnectProviderArn;

    const repoSub = `repo:${config.githubOrg}/${config.githubRepo}`;

    for (const target of deployTargets) {
      const principal = new WebIdentityPrincipal(providerArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": GITHUB_OIDC_AUDIENCE,
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `${repoSub}:ref:refs/heads/${target.branch}`,
        },
      });

      const role = new Role(this, `DeployRole-${target.stage}`, {
        roleName: `${config.project}-deploy-${target.stage}`,
        assumedBy: principal,
        description: `GitHub Actions deploy role for ${target.stage} (branch ${target.branch})`,
      });

      // Scoped CDK-deploy permission: assume only this account's CDK bootstrap roles.
      role.addToPolicy(
        new PolicyStatement({
          sid: "AssumeCdkBootstrapRoles",
          effect: Effect.ALLOW,
          actions: ["sts:AssumeRole"],
          resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
        }),
      );

      // Frontend publish: the deploy workflow reads this env's runtime config from SSM,
      // syncs the built SPA to its web bucket, and invalidates its CloudFront distribution.
      // (cdk deploy itself goes through the bootstrap cfn-exec role above; these are for the
      // workflow's own direct AWS calls.)
      role.addToPolicy(
        new PolicyStatement({
          sid: "ReadEnvConfigFromSsm",
          effect: Effect.ALLOW,
          actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/${config.project}/${target.stage}/*`,
          ],
        }),
      );
      role.addToPolicy(
        new PolicyStatement({
          sid: "PublishWebBucket",
          effect: Effect.ALLOW,
          actions: ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          resources: [
            `arn:aws:s3:::${config.project}-${target.stage}-web-${this.account}`,
            `arn:aws:s3:::${config.project}-${target.stage}-web-${this.account}/*`,
          ],
        }),
      );
      role.addToPolicy(
        new PolicyStatement({
          sid: "InvalidateCloudFront",
          effect: Effect.ALLOW,
          actions: ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
          resources: [`arn:aws:cloudfront::${this.account}:distribution/*`],
        }),
      );

      putOutput(
        this,
        config,
        `cicd/deployRoleArn-${target.stage}`,
        role.roleArn,
        `Deploy role for ${target.stage}`,
      );
      new CfnOutput(this, `DeployRoleArn-${target.stage}`, { value: role.roleArn });
    }

    // --- Account budget alarm ---
    const budgetTopic = new Topic(this, "BudgetAlarmTopic", {
      topicName: `${config.project}-budget-alarm`,
    });

    const monthlyBudgetUsd = Number(this.node.tryGetContext("monthlyBudgetUsd") ?? 75);
    const budgetEmail = this.node.tryGetContext("budgetNotifyEmail") as string | undefined;

    const subscribers: CfnBudget.SubscriberProperty[] = [
      { subscriptionType: "SNS", address: budgetTopic.topicArn },
    ];
    if (budgetEmail) {
      subscribers.push({ subscriptionType: "EMAIL", address: budgetEmail });
    }

    new CfnBudget(this, "AccountBudget", {
      budget: {
        budgetName: `${config.project}-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: monthlyBudgetUsd, unit: "USD" },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers,
        },
        {
          notification: {
            notificationType: "FORECASTED",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers,
        },
      ],
    });

    putOutput(this, config, "cicd/githubOidcArn", providerArn, "GitHub OIDC provider ARN");
    putOutput(this, config, "cicd/budgetTopicArn", budgetTopic.topicArn, "Budget alarm SNS topic");

    new CfnOutput(this, "GithubOidcArn", { value: providerArn });
  }
}
