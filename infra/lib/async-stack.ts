import { join } from "node:path";
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import { Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";
import { putOutput } from "./ssm";
import { bedrockInvokeStatement } from "./policies";

export interface AsyncStackProps extends StackProps {
  readonly config: EnvConfig;
  readonly table: Table;
}

/**
 * AsyncStack — college/scholarship hydration pipeline.
 *
 * SQS hydration queue + DLQ. The worker Lambda consumes ONE message at a time
 * (batchSize 1) for Bedrock throttle safety, with a 300s timeout (hydration is
 * long-running). Failures after maxReceiveCount land in the DLQ.
 *
 * The worker handler is the real code built from backend/lambda/hydration.ts (bundled to
 * backend/dist/hydration by `build:lambda`). The role grants DynamoDB CRUD on the table +
 * Bedrock invoke on the cross-region Sonnet inference profile.
 */
export class AsyncStack extends Stack {
  public readonly hydrationQueue: Queue;
  public readonly deadLetterQueue: Queue;
  public readonly workerFunctionName: string;

  constructor(scope: Construct, id: string, props: AsyncStackProps) {
    super(scope, id, props);
    const { config, table } = props;

    this.deadLetterQueue = new Queue(this, "HydrationDlq", {
      queueName: `${config.namePrefix}-hydration-dlq`,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    this.hydrationQueue = new Queue(this, "HydrationQueue", {
      queueName: `${config.namePrefix}-hydration`,
      // Must be >= the worker timeout so a message isn't redelivered mid-processing.
      visibilityTimeout: Duration.seconds(360),
      retentionPeriod: Duration.days(4),
      enforceSSL: true,
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: 3 },
    });

    const worker = new LambdaFunction(this, "HydrationWorker", {
      functionName: `${config.namePrefix}-hydration-worker`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      // Real worker asset built by `npm run -w backend build:lambda` (CI builds it before
      // deploy). fromAsset on a missing dir fails synth loudly — no silent placeholder ships.
      code: Code.fromAsset(join(__dirname, "../../backend/dist/hydration")),
      timeout: Duration.seconds(300),
      memorySize: 512,
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: table.tableName,
        HYDRATION_QUEUE_URL: this.hydrationQueue.queueUrl,
        BEDROCK_MODEL_ID: config.bedrockSonnetProfile,
        STAGE: config.stage,
      },
    });
    this.workerFunctionName = worker.functionName;

    // One message at a time — Bedrock throttle safety.
    worker.addEventSource(
      new SqsEventSource(this.hydrationQueue, { batchSize: 1, reportBatchItemFailures: true }),
    );

    // Least-privilege: DynamoDB CRUD on the table (+ indexes), Bedrock invoke.
    table.grantReadWriteData(worker);
    worker.addToRolePolicy(bedrockInvokeStatement(this.account, config.bedrockSonnetProfile));

    putOutput(this, config, "hydrationQueueUrl", this.hydrationQueue.queueUrl, "Hydration SQS URL");
    putOutput(this, config, "hydrationQueueArn", this.hydrationQueue.queueArn, "Hydration SQS ARN");
    putOutput(this, config, "hydrationDlqUrl", this.deadLetterQueue.queueUrl, "Hydration DLQ URL");

    new CfnOutput(this, "HydrationQueueUrl", { value: this.hydrationQueue.queueUrl });
    new CfnOutput(this, "HydrationDlqUrl", { value: this.deadLetterQueue.queueUrl });
  }
}
