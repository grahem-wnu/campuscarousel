import { join } from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction as LambdaFunctionTarget } from "aws-cdk-lib/aws-events-targets";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function as LambdaFunction, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { BlockPublicAccess, Bucket, BucketEncryption, type IBucket } from "aws-cdk-lib/aws-s3";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import type { Construct } from "constructs";
import { envHostname, type EnvConfig } from "./config";
import { putOutput } from "./ssm";
import {
  bedrockInvokeStatement,
  cloudwatchPutMetricStatement,
  costExplorerReadStatement,
  s3ReadStatement,
  sesSendStatement,
  snsPublishStatement,
  ssmReadConfigStatement,
} from "./policies";

export interface AsyncStackProps extends StackProps {
  readonly config: EnvConfig;
  readonly table: Table;
  /** Media bucket the assets worker writes campus photos + logos into (from AssetsStack). */
  readonly assetsBucket: IBucket;
  /** CloudFront base url for that bucket; the worker stamps `<base>/<key>` onto the college. */
  readonly assetsBaseUrl: string;
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
  public readonly digestFunctionName: string;
  public readonly assetsQueue: Queue;
  public readonly assetsDeadLetterQueue: Queue;
  public readonly assetsWorkerFunctionName: string;
  /** Interactive lane: user-initiated focus overview / career-path jobs run here so they never queue
   *  behind bulk college hydration. The API Lambda sends to this queue via FOCUS_QUEUE_URL. */
  public readonly focusQueue: Queue;
  public readonly focusDeadLetterQueue: Queue;
  public readonly focusWorkerFunctionName: string;
  /** Interactive essay-coach lane: user-initiated essay questions + evaluation jobs run here so they
   *  never queue behind bulk college hydration. The API Lambda sends via ESSAY_COACH_QUEUE_URL. */
  public readonly essayCoachQueue: Queue;
  public readonly essayCoachDeadLetterQueue: Queue;
  public readonly essayCoachWorkerFunctionName: string;
  /** PROD-ONLY: daily Bedrock cost-reconciliation Lambda name (undefined in staging). */
  public readonly reconcileFunctionName?: string;

  constructor(scope: Construct, id: string, props: AsyncStackProps) {
    super(scope, id, props);
    const { config, table, assetsBucket, assetsBaseUrl } = props;

    this.deadLetterQueue = new Queue(this, "HydrationDlq", {
      queueName: `${config.namePrefix}-hydration-dlq`,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    this.hydrationQueue = new Queue(this, "HydrationQueue", {
      queueName: `${config.namePrefix}-hydration`,
      // AWS guidance for SQS event sources is visibility timeout >= 6x the function timeout
      // (300s) so a slow/retried Bedrock hydration is never redelivered mid-processing.
      visibilityTimeout: Duration.seconds(1800),
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
      // Cap concurrent workers so an SQS burst can't fan out to hundreds of simultaneous
      // ~140s Bedrock calls (throttling + runaway cost). batchSize:1 limits per-invocation,
      // NOT concurrency — this is the real throttle/cost guard. 10 lanes so a bulk FTUE seed wave
      // (~12 college-hydrate jobs) drains in ~2 min instead of ~8; total spend is per-token, so more
      // lanes only changes speed, not cost. Interactive focus jobs run on their own queue (below).
      reservedConcurrentExecutions: 10,
      // Active tracing across the API -> SQS -> worker -> Bedrock chain for latency debugging.
      tracing: Tracing.ACTIVE,
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: table.tableName,
        HYDRATION_QUEUE_URL: this.hydrationQueue.queueUrl,
        BEDROCK_MODEL_ID: config.bedrockSonnetProfile,
        // Shared AI web-search (backend/shared/ai): SSM_PREFIX locates the Tavily SecureString;
        // AI_WEB_SEARCH enables the web_search tool for worker-side hydration.
        SSM_PREFIX: config.ssmPrefix,
        AI_WEB_SEARCH: "true",
        STAGE: config.stage,
      },
    });
    this.workerFunctionName = worker.functionName;

    // One message at a time — Bedrock throttle safety.
    worker.addEventSource(
      new SqsEventSource(this.hydrationQueue, { batchSize: 1, reportBatchItemFailures: true }),
    );

    // Least-privilege: DynamoDB CRUD on the table (+ indexes), Bedrock invoke, and read of this
    // env's SSM config prefix (the Tavily key SecureString for web-grounded hydration).
    table.grantReadWriteData(worker);
    worker.addToRolePolicy(bedrockInvokeStatement(this.account, config.bedrockSonnetProfile));
    worker.addToRolePolicy(ssmReadConfigStatement(this.region, this.account, config.ssmPrefix));

    putOutput(this, config, "hydrationQueueUrl", this.hydrationQueue.queueUrl, "Hydration SQS URL");
    putOutput(this, config, "hydrationQueueArn", this.hydrationQueue.queueArn, "Hydration SQS ARN");
    putOutput(this, config, "hydrationDlqUrl", this.deadLetterQueue.queueUrl, "Hydration DLQ URL");

    new CfnOutput(this, "HydrationQueueUrl", { value: this.hydrationQueue.queueUrl });
    new CfnOutput(this, "HydrationDlqUrl", { value: this.deadLetterQueue.queueUrl });

    // -----------------------------------------------------------------------
    // Reminder digest (v2.1 F1): an hourly EventBridge schedule fires the digest Lambda, which
    // gates to the configured send hour/weekday (settings live in DynamoDB) and emails each
    // recipient's upcoming/overdue deadlines via SES. 60s timeout — it's a quick read + send.
    // -----------------------------------------------------------------------
    const appUrl = `https://${envHostname(config)}`;
    const digest = new LambdaFunction(this, "ReminderDigest", {
      functionName: `${config.namePrefix}-reminder-digest`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      // Real asset built by `npm run -w backend build:lambda` (CI builds before deploy).
      code: Code.fromAsset(join(__dirname, "../../backend/dist/digest")),
      timeout: Duration.seconds(60),
      memorySize: 256,
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: table.tableName,
        REMINDER_SENDER_EMAIL: config.reminderSenderEmail,
        APP_URL: appUrl,
        STAGE: config.stage,
      },
    });
    this.digestFunctionName = digest.functionName;

    // Read all entities for the digest + update lastSentAt on the settings singleton.
    table.grantReadWriteData(digest);
    digest.addToRolePolicy(sesSendStatement(this.region, this.account));

    // Fire hourly at minute 0; the Lambda itself decides whether this hour/weekday should send.
    new Rule(this, "ReminderDigestSchedule", {
      ruleName: `${config.namePrefix}-reminder-digest`,
      schedule: Schedule.cron({ minute: "0" }),
      targets: [new LambdaFunctionTarget(digest)],
    });

    putOutput(this, config, "reminderDigestFn", digest.functionName, "Reminder digest Lambda name");
    new CfnOutput(this, "ReminderDigestFn", { value: digest.functionName });

    // --- Parallel assets pipeline: campus photos + logos -----------------------------------------
    // A separate queue + worker so imagery fetches (Wikimedia + Clearbit → S3, seconds) run
    // concurrently with — and never queue behind — the long Bedrock text hydration. The worker
    // reuses the SAME bundle (backend/dist/hydration); the shared registry dispatches the
    // `college-assets` message type to its handler. No Bedrock/SSM grant — it only needs S3 + Dynamo.
    this.assetsDeadLetterQueue = new Queue(this, "AssetsDlq", {
      queueName: `${config.namePrefix}-assets-dlq`,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    this.assetsQueue = new Queue(this, "AssetsQueue", {
      queueName: `${config.namePrefix}-assets`,
      // Must be >= the assets worker timeout so a message isn't redelivered mid-processing.
      visibilityTimeout: Duration.seconds(180),
      retentionPeriod: Duration.days(4),
      enforceSSL: true,
      deadLetterQueue: { queue: this.assetsDeadLetterQueue, maxReceiveCount: 3 },
    });

    const assetsWorker = new LambdaFunction(this, "AssetsWorker", {
      functionName: `${config.namePrefix}-assets-worker`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: Code.fromAsset(join(__dirname, "../../backend/dist/hydration")),
      // Image fetch + S3 put is quick; no Bedrock, so a much shorter budget than hydration.
      timeout: Duration.seconds(120),
      memorySize: 512,
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: table.tableName,
        ASSETS_QUEUE_URL: this.assetsQueue.queueUrl,
        ASSETS_BUCKET: assetsBucket.bucketName,
        ASSETS_BASE_URL: assetsBaseUrl,
        STAGE: config.stage,
      },
    });
    this.assetsWorkerFunctionName = assetsWorker.functionName;

    // One message at a time (matches the hydration worker); failures retry then land in the DLQ.
    assetsWorker.addEventSource(
      new SqsEventSource(this.assetsQueue, { batchSize: 1, reportBatchItemFailures: true }),
    );

    // Least-privilege: DynamoDB CRUD on the table + write objects to the media bucket. No Bedrock/SSM.
    table.grantReadWriteData(assetsWorker);
    assetsBucket.grantPut(assetsWorker);

    // The hydration worker also seeds a newly-onboarded student's starter colleges (the backgrounded
    // `onboarding-seed` job), which dispatches per-college imagery to the assets queue — so it needs
    // the assets queue URL + send permission, like the API Lambda has.
    worker.addEnvironment("ASSETS_QUEUE_URL", this.assetsQueue.queueUrl);
    this.assetsQueue.grantSendMessages(worker);

    // The seed also fans out per-college TEXT hydration onto the hydration queue (the same queue this
    // worker consumes). The SqsEventSource grants consume-only (receive/delete) — NOT send — so the
    // seed's enqueue was denied and silently fell back to a ~140s inline hydrate per college, blowing
    // the 300s budget after ~2 colleges. Grant send so the seed enqueues instead of hydrating inline.
    this.hydrationQueue.grantSendMessages(worker);

    putOutput(this, config, "assetsQueueUrl", this.assetsQueue.queueUrl, "Assets SQS URL");
    putOutput(this, config, "assetsQueueArn", this.assetsQueue.queueArn, "Assets SQS ARN");
    putOutput(this, config, "assetsDlqUrl", this.assetsDeadLetterQueue.queueUrl, "Assets DLQ URL");

    new CfnOutput(this, "AssetsQueueUrl", { value: this.assetsQueue.queueUrl });
    new CfnOutput(this, "AssetsDlqUrl", { value: this.assetsDeadLetterQueue.queueUrl });

    // --- Interactive focus lane: priority queue + worker -----------------------------------------
    // User-initiated focus overview / career-path jobs are web-grounded (~2 min) just like college
    // hydration, but they are INTERACTIVE — a person is watching a spinner. A separate queue + worker
    // (reusing the SAME bundle; the shared registry routes `focus-overview`/`kind:'career'`) keeps
    // them off the bulk hydration lanes, so a "Generate" click runs immediately no matter how big the
    // college-hydrate backlog is. Same Bedrock/SSM/Dynamo grants as the hydration worker.
    this.focusDeadLetterQueue = new Queue(this, "FocusDlq", {
      queueName: `${config.namePrefix}-focus-dlq`,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    this.focusQueue = new Queue(this, "FocusQueue", {
      queueName: `${config.namePrefix}-focus`,
      // >= 6x the worker timeout (300s), matching the hydration queue, so a slow/retried run isn't
      // redelivered mid-processing.
      visibilityTimeout: Duration.seconds(1800),
      retentionPeriod: Duration.days(4),
      enforceSSL: true,
      deadLetterQueue: { queue: this.focusDeadLetterQueue, maxReceiveCount: 3 },
    });

    const focusWorker = new LambdaFunction(this, "FocusWorker", {
      functionName: `${config.namePrefix}-focus-worker`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: Code.fromAsset(join(__dirname, "../../backend/dist/hydration")),
      timeout: Duration.seconds(300),
      memorySize: 512,
      // Small dedicated lane for interactive jobs — low volume (one per user click), so a few lanes
      // keep "Generate" responsive without competing with bulk hydration for Bedrock throughput.
      reservedConcurrentExecutions: 3,
      tracing: Tracing.ACTIVE,
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: table.tableName,
        BEDROCK_MODEL_ID: config.bedrockSonnetProfile,
        SSM_PREFIX: config.ssmPrefix,
        AI_WEB_SEARCH: "true",
        STAGE: config.stage,
      },
    });
    this.focusWorkerFunctionName = focusWorker.functionName;

    focusWorker.addEventSource(
      new SqsEventSource(this.focusQueue, { batchSize: 1, reportBatchItemFailures: true }),
    );

    table.grantReadWriteData(focusWorker);
    focusWorker.addToRolePolicy(bedrockInvokeStatement(this.account, config.bedrockSonnetProfile));
    focusWorker.addToRolePolicy(ssmReadConfigStatement(this.region, this.account, config.ssmPrefix));

    putOutput(this, config, "focusQueueUrl", this.focusQueue.queueUrl, "Focus (interactive) SQS URL");
    putOutput(this, config, "focusQueueArn", this.focusQueue.queueArn, "Focus (interactive) SQS ARN");
    putOutput(this, config, "focusDlqUrl", this.focusDeadLetterQueue.queueUrl, "Focus DLQ URL");

    new CfnOutput(this, "FocusQueueUrl", { value: this.focusQueue.queueUrl });
    new CfnOutput(this, "FocusDlqUrl", { value: this.focusDeadLetterQueue.queueUrl });

    // --- Interactive essay-coach lane: priority queue + worker ------------------------------------
    // User-initiated essay-coach jobs (practice questions + essay evaluation) are INTERACTIVE — a
    // person is watching a spinner ("up to a minute"). A separate queue + worker (reusing the SAME
    // bundle; the shared registry routes the `essay-coach` type, sub-routed by `kind`) keeps them off
    // the bulk hydration lanes so a click runs immediately no matter how big the hydrate backlog is.
    // Unlike focus/hydration these jobs are MODEL-ONLY (no web search) — so NO AI_WEB_SEARCH env.
    this.essayCoachDeadLetterQueue = new Queue(this, "EssayCoachDlq", {
      queueName: `${config.namePrefix}-essay-coach-dlq`,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    this.essayCoachQueue = new Queue(this, "EssayCoachQueue", {
      queueName: `${config.namePrefix}-essay-coach`,
      // >= 6x the worker timeout (300s), matching the hydration/focus queues, so a slow/retried run
      // isn't redelivered mid-processing.
      visibilityTimeout: Duration.seconds(1800),
      retentionPeriod: Duration.days(4),
      enforceSSL: true,
      deadLetterQueue: { queue: this.essayCoachDeadLetterQueue, maxReceiveCount: 3 },
    });

    const essayCoachWorker = new LambdaFunction(this, "EssayCoachWorker", {
      functionName: `${config.namePrefix}-essay-coach-worker`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: Code.fromAsset(join(__dirname, "../../backend/dist/hydration")),
      timeout: Duration.seconds(300),
      memorySize: 512,
      // Small dedicated lane for interactive essay-coach jobs — low volume (one per user click), so a
      // few lanes keep questions/evaluate responsive without competing with bulk hydration for Bedrock.
      reservedConcurrentExecutions: 5,
      tracing: Tracing.ACTIVE,
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: table.tableName,
        BEDROCK_MODEL_ID: config.bedrockSonnetProfile,
        SSM_PREFIX: config.ssmPrefix,
        STAGE: config.stage,
      },
    });
    this.essayCoachWorkerFunctionName = essayCoachWorker.functionName;

    essayCoachWorker.addEventSource(
      new SqsEventSource(this.essayCoachQueue, { batchSize: 1, reportBatchItemFailures: true }),
    );

    table.grantReadWriteData(essayCoachWorker);
    essayCoachWorker.addToRolePolicy(bedrockInvokeStatement(this.account, config.bedrockSonnetProfile));
    essayCoachWorker.addToRolePolicy(ssmReadConfigStatement(this.region, this.account, config.ssmPrefix));

    putOutput(this, config, "essayCoachQueueUrl", this.essayCoachQueue.queueUrl, "Essay-coach (interactive) SQS URL");
    putOutput(this, config, "essayCoachQueueArn", this.essayCoachQueue.queueArn, "Essay-coach (interactive) SQS ARN");
    putOutput(this, config, "essayCoachDlqUrl", this.essayCoachDeadLetterQueue.queueUrl, "Essay-coach DLQ URL");

    new CfnOutput(this, "EssayCoachQueueUrl", { value: this.essayCoachQueue.queueUrl });
    new CfnOutput(this, "EssayCoachDlqUrl", { value: this.essayCoachDeadLetterQueue.queueUrl });

    // --- PROD-ONLY: Bedrock cost reconciliation (Phase 2B) --------------------------------------
    // Staging + prod share ONE AWS account + one Bedrock inference profile, so Cost Explorer $ and
    // the account-global model-invocation logging config are account-total — they can't separate the
    // two envs. Reconciliation therefore runs in PROD ONLY (staging's tiny QA usage is absorbed as
    // noise by the drift threshold), which also avoids the account-global single-owner conflict on the
    // logging config. Everything below is created only when config.stage === 'prod', so staging synth
    // cleanly omits the bucket, the logging config, and the reconcile Lambda + schedule.
    if (config.stage === "prod") {
      // Invocation-log bucket. RETAIN (prod data) + all-public-access blocked + SSE + TLS-only, mirroring
      // the assets bucket. Bedrock delivers model-invocation logs here under the keyPrefix below.
      const logBucket = new Bucket(this, "BedrockInvocationLogs", {
        bucketName: `${config.namePrefix}-bedrock-logs-${this.account}`,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.RETAIN,
      });

      // Let the Bedrock service principal deliver logs into the bucket, constrained to THIS account.
      const bucketPolicy = logBucket.addToResourcePolicy(
        new PolicyStatement({
          sid: "AllowBedrockLogDelivery",
          actions: ["s3:PutObject"],
          resources: [`${logBucket.bucketArn}/*`],
          principals: [new ServicePrincipal("bedrock.amazonaws.com")],
          conditions: { StringEquals: { "aws:SourceAccount": this.account } },
        }),
      );

      // Enable Bedrock model-invocation logging via an AwsCustomResource. There is NO L1 for this
      // (no CfnModelInvocationLoggingConfiguration / AWS::Bedrock::ModelInvocationLoggingConfiguration) —
      // model-invocation logging is API-only. Account+region-global, so only prod owns it.
      const loggingConfig = new AwsCustomResource(this, "BedrockInvocationLoggingConfig", {
        onCreate: {
          service: "Bedrock",
          action: "PutModelInvocationLoggingConfiguration",
          parameters: {
            loggingConfig: {
              s3Config: { bucketName: logBucket.bucketName, keyPrefix: "bedrock-invocation-logs/" },
              textDataDeliveryEnabled: true,
              imageDataDeliveryEnabled: false,
              embeddingDataDeliveryEnabled: false,
            },
          },
          physicalResourceId: PhysicalResourceId.of("bedrock-invocation-logging"),
        },
        onUpdate: {
          service: "Bedrock",
          action: "PutModelInvocationLoggingConfiguration",
          parameters: {
            loggingConfig: {
              s3Config: { bucketName: logBucket.bucketName, keyPrefix: "bedrock-invocation-logs/" },
              textDataDeliveryEnabled: true,
              imageDataDeliveryEnabled: false,
              embeddingDataDeliveryEnabled: false,
            },
          },
          physicalResourceId: PhysicalResourceId.of("bedrock-invocation-logging"),
        },
        onDelete: {
          service: "Bedrock",
          action: "DeleteModelInvocationLoggingConfiguration",
        },
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            // These Bedrock actions have no resource-level ARNs — `*` is the only valid resource.
            actions: [
              "bedrock:PutModelInvocationLoggingConfiguration",
              "bedrock:DeleteModelInvocationLoggingConfiguration",
            ],
            resources: ["*"],
          }),
        ]),
      });
      // The bucket must accept Bedrock's PutObject before the logging config activates.
      if (bucketPolicy.policyDependable) {
        loggingConfig.node.addDependency(bucketPolicy.policyDependable);
      }

      // Reconcile Lambda. Reads raw usage + AWS actuals, writes rollups + a status row, alerts on drift.
      // The alarm-topic ARN is resolved from SSM at RUNTIME (see the entry), NOT injected here — obs
      // deploys after async, so a deploy-time cross-stack read/prop would be a from-scratch ordering
      // hazard (and prop-passing is circular since obs already consumes async's worker name).
      const reconcile = new LambdaFunction(this, "MeteringReconcile", {
        functionName: `${config.namePrefix}-metering-reconcile`,
        runtime: Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: Code.fromAsset(join(__dirname, "../../backend/dist/reconcile")),
        timeout: Duration.seconds(120),
        memorySize: 256,
        logRetention: RetentionDays.ONE_MONTH,
        environment: {
          TABLE_NAME: table.tableName,
          STAGE: config.stage,
          RECON_LOG_BUCKET: logBucket.bucketName,
          RECON_DRIFT_THRESHOLD_PCT: "5",
          SSM_PREFIX: config.ssmPrefix,
        },
      });
      this.reconcileFunctionName = reconcile.functionName;

      // Least-privilege grants. The SNS topic ARN is constructed by naming convention (obs names it
      // `${namePrefix}-alarms`) for the IAM grant; the actual ARN still comes from SSM at runtime.
      const alarmTopicArn = `arn:aws:sns:${this.region}:${this.account}:${config.namePrefix}-alarms`;
      table.grantReadWriteData(reconcile);
      reconcile.addToRolePolicy(costExplorerReadStatement());
      reconcile.addToRolePolicy(s3ReadStatement(logBucket.bucketArn));
      reconcile.addToRolePolicy(snsPublishStatement(alarmTopicArn));
      reconcile.addToRolePolicy(cloudwatchPutMetricStatement());
      // For the runtime read of `${SSM_PREFIX}/alarmTopicArn`.
      reconcile.addToRolePolicy(ssmReadConfigStatement(this.region, this.account, config.ssmPrefix));

      // Daily at 07:00 UTC — Cost Explorer is ~24h delayed, so a morning run reconciles yesterday.
      new Rule(this, "ReconcileSchedule", {
        ruleName: `${config.namePrefix}-metering-reconcile`,
        schedule: Schedule.cron({ minute: "0", hour: "7" }),
        targets: [new LambdaFunctionTarget(reconcile)],
      });

      putOutput(this, config, "reconcileFn", reconcile.functionName, "Metering reconciliation Lambda name");
      putOutput(this, config, "bedrockLogBucket", logBucket.bucketName, "Bedrock invocation-log S3 bucket");
      new CfnOutput(this, "ReconcileFn", { value: reconcile.functionName });
      new CfnOutput(this, "BedrockLogBucket", { value: logBucket.bucketName });
    }
  }
}
