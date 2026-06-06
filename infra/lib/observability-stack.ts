import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  Metric,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config.js";
import { putOutput } from "./ssm.js";

export interface ObservabilityStackProps extends StackProps {
  readonly config: EnvConfig;
  readonly apiName: string;
  readonly apiId: string;
  readonly routingFunctionName: string;
  readonly workerFunctionName: string;
  readonly distributionId: string;
}

/**
 * ObservabilityStack (per-env) — app log group + CloudWatch alarms + a dashboard.
 *
 * - A shared application log group for structured app logs (retention set per env).
 * - Error/throttle alarms on the routing + hydration Lambdas, and a 5xx alarm on the
 *   HTTP API, so failures during the autonomous build surface immediately.
 * - A dashboard collecting the key widgets.
 *
 * (The account-wide cost/budget alarm is account-global and lives in CicdStack.)
 */
export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { config, apiId, routingFunctionName, workerFunctionName } = props;

    const removalPolicy =
      config.removalPolicy === "retain" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    const appLogGroup = new LogGroup(this, "AppLogGroup", {
      logGroupName: `/${config.project}/${config.stage}/app`,
      retention: config.stage === "prod" ? RetentionDays.SIX_MONTHS : RetentionDays.ONE_MONTH,
      removalPolicy,
    });

    const lambdaErrors = (fn: string) =>
      new Metric({
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensionsMap: { FunctionName: fn },
        statistic: "Sum",
        period: Duration.minutes(5),
      });

    const lambdaThrottles = (fn: string) =>
      new Metric({
        namespace: "AWS/Lambda",
        metricName: "Throttles",
        dimensionsMap: { FunctionName: fn },
        statistic: "Sum",
        period: Duration.minutes(5),
      });

    const api5xx = new Metric({
      namespace: "AWS/ApiGateway",
      metricName: "5xx",
      dimensionsMap: { ApiId: apiId },
      statistic: "Sum",
      period: Duration.minutes(5),
    });

    const mkAlarm = (idSuffix: string, metric: Metric, threshold: number) =>
      new Alarm(this, `Alarm-${idSuffix}`, {
        alarmName: `${config.namePrefix}-${idSuffix}`,
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });

    mkAlarm("routing-errors", lambdaErrors(routingFunctionName), 1);
    mkAlarm("routing-throttles", lambdaThrottles(routingFunctionName), 1);
    mkAlarm("worker-errors", lambdaErrors(workerFunctionName), 1);
    mkAlarm("worker-throttles", lambdaThrottles(workerFunctionName), 1);
    mkAlarm("api-5xx", api5xx, 1);

    const dashboard = new Dashboard(this, "Dashboard", {
      dashboardName: `${config.namePrefix}-ops`,
    });
    dashboard.addWidgets(
      new GraphWidget({
        title: "Lambda errors",
        left: [lambdaErrors(routingFunctionName), lambdaErrors(workerFunctionName)],
      }),
      new GraphWidget({ title: "API 5xx", left: [api5xx] }),
    );

    putOutput(this, config, "appLogGroupName", appLogGroup.logGroupName, "Application log group");

    new CfnOutput(this, "AppLogGroupName", { value: appLogGroup.logGroupName });
  }
}
