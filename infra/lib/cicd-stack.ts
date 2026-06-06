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
import type { GlobalConfig } from "./config.js";
import { putOutput } from "./ssm.js";

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

    const provider = new OpenIdConnectProvider(this, "GithubOidc", {
      url: GITHUB_OIDC_URL,
      clientIds: [GITHUB_OIDC_AUDIENCE],
    });

    const repoSub = `repo:${config.githubOrg}/${config.githubRepo}`;

    for (const target of deployTargets) {
      const principal = new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
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

    putOutput(this, config, "cicd/githubOidcArn", provider.openIdConnectProviderArn, "GitHub OIDC provider ARN");
    putOutput(this, config, "cicd/budgetTopicArn", budgetTopic.topicArn, "Budget alarm SNS topic");

    new CfnOutput(this, "GithubOidcArn", { value: provider.openIdConnectProviderArn });
  }
}
