import { join } from "node:path";
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi, HttpMethod, CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import type { Bucket } from "aws-cdk-lib/aws-s3";
import type { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";
import { envHostname } from "./config";
import { putOutput } from "./ssm";
import { bedrockInvokeStatement } from "./policies";

export interface ApiStackProps extends StackProps {
  readonly config: EnvConfig;
  readonly table: Table;
  readonly documentsBucket: Bucket;
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly hydrationQueue: Queue;
  readonly assetsQueue: Queue;
}

/**
 * ApiStack — API Gateway HTTP API + Cognito JWT authorizer + one routing Lambda.
 *
 * Per specs/foundational/api.md: a single Node 20 routing Lambda fronts every route
 * (the app assembles per-module routes from manifests at build time). The HTTP API's
 * Cognito JWT authorizer validates every request — no custom auth code. Long ops
 * (hydration/discovery) return immediately after the routing Lambda enqueues to SQS;
 * the 300s worker (AsyncStack) does the heavy Bedrock work. So the routing Lambda runs
 * on the DEFAULT timeout (CRUD), while the 300s hydration Lambda lives in AsyncStack.
 *
 * Least-privilege role: DynamoDB CRUD on the table, SQS send to the hydration queue,
 * Bedrock invoke (Sonnet inference profile), and read of this env's SSM config prefix.
 */
export class ApiStack extends Stack {
  public readonly httpApiName: string;
  public readonly routingFunctionName: string;
  public readonly apiUrl: string;
  public readonly apiId: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config, table, documentsBucket, userPool, userPoolClient, hydrationQueue, assetsQueue } = props;

    const routing = new LambdaFunction(this, "RoutingFn", {
      functionName: `${config.namePrefix}-api-routing`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      // Real backend asset built by `npm run -w backend build:lambda` (CI builds it before
      // deploy). fromAsset on a missing dir fails synth loudly — no silent placeholder ships.
      code: Code.fromAsset(join(__dirname, "../../backend/dist/api")),
      // CRUD default timeout — hydration is offloaded to the SQS worker.
      timeout: Duration.seconds(30),
      memorySize: 512,
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: table.tableName,
        DOCUMENTS_BUCKET: documentsBucket.bucketName,
        HYDRATION_QUEUE_URL: hydrationQueue.queueUrl,
        ASSETS_QUEUE_URL: assetsQueue.queueUrl,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        BEDROCK_MODEL_ID: config.bedrockSonnetProfile,
        SSM_PREFIX: config.ssmPrefix,
        // Enable the shared AI web_search tool (backend/shared/ai) for AI handlers. The Tavily key
        // SecureString is read at runtime from `${SSM_PREFIX}/tavilyApiKey` (role already grants it).
        AI_WEB_SEARCH: "true",
        STAGE: config.stage,
      },
    });
    this.routingFunctionName = routing.functionName;

    // Least-privilege grants.
    table.grantReadWriteData(routing);
    documentsBucket.grantReadWrite(routing); // presigned PUT/GET of family documents (v2.1 F2)
    documentsBucket.grantDelete(routing);
    hydrationQueue.grantSendMessages(routing);
    assetsQueue.grantSendMessages(routing);
    routing.addToRolePolicy(bedrockInvokeStatement(this.account, config.bedrockSonnetProfile));
    routing.addToRolePolicy(
      new PolicyStatement({
        sid: "ReadEnvConfig",
        actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${config.ssmPrefix}/*`],
      }),
    );

    // Cognito JWT authorizer — validates the token against this pool + SPA client.
    const authorizer = new HttpUserPoolAuthorizer("JwtAuthorizer", userPool, {
      userPoolClients: [userPoolClient],
    });

    const integration = new HttpLambdaIntegration("RoutingIntegration", routing);

    // No defaultAuthorizer/defaultIntegration: those create a `$default` route bound to the
    // JWT authorizer, which also matches the browser's CORS preflight OPTIONS. An authorized
    // OPTIONS returns 401 (no token on a preflight), so the preflight fails its "HTTP ok"
    // check and the browser blocks the real request ("Failed to fetch"). API Gateway only
    // auto-answers preflight (204) when NO route matches the OPTIONS request, so we leave
    // OPTIONS unrouted and let the corsPreflight config handle it.
    const api = new HttpApi(this, "HttpApi", {
      apiName: `${config.namePrefix}-api`,
      corsPreflight: {
        allowOrigins: [`https://${envHostname(config)}`, "http://localhost:5173"],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["authorization", "content-type"],
        maxAge: Duration.hours(1),
      },
    });

    // Catch-all: the routing Lambda dispatches by method+path internally. We enumerate the
    // real verbs instead of ANY so the route does NOT match OPTIONS — preflight is left for
    // API Gateway's automatic CORS responder (see HttpApi comment above).
    api.addRoutes({
      path: "/{proxy+}",
      methods: [
        HttpMethod.GET,
        HttpMethod.POST,
        HttpMethod.PUT,
        HttpMethod.PATCH,
        HttpMethod.DELETE,
      ],
      integration,
      authorizer,
    });

    this.httpApiName = `${config.namePrefix}-api`;
    this.apiUrl = api.apiEndpoint;
    this.apiId = api.apiId;

    putOutput(this, config, "apiUrl", api.apiEndpoint, "HTTP API base URL");
    putOutput(this, config, "apiId", api.apiId, "HTTP API id");

    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "RoutingFunctionName", { value: routing.functionName });
  }
}
