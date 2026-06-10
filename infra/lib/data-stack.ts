import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { envHostname, type EnvConfig } from "./config";
import { putOutput } from "./ssm";

export interface DataStackProps extends StackProps {
  readonly config: EnvConfig;
}

/**
 * DataStack — the single DynamoDB table for the whole app.
 *
 * Single-table design per specs/foundational/data-layer.md + the master spec
 * ("Data Model"):
 *   PK / SK            composite primary key (e.g. ACTIVITY#<id> / DETAILS)
 *   GSI1 (by date)     GSI1PK=ACTIVITIES,          GSI1SK=<date>#<id>
 *   GSI2 (by category) GSI2PK=CATEGORY#<category>, GSI2SK=<date>#<id>
 *   GSI3 (by facility) GSI3PK=FACILITY#<name>,     GSI3SK=<date>#<id>   (clinical hours)
 *   GSI4 (TEAS by date)GSI4PK=TEAS_SCORES,         GSI4SK=<date>#<id>
 *
 * On-demand billing, PITR on. The table name is NOT hardcoded anywhere — CDK generates
 * it and publishes it to SSM for consumers.
 */
export class DataStack extends Stack {
  public readonly table: Table;
  public readonly documentsBucket: Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config } = props;

    const removalPolicy =
      config.removalPolicy === "retain" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    this.table = new Table(this, "AppTable", {
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: TableEncryption.AWS_MANAGED,
      removalPolicy,
      deletionProtection: config.stage === "prod",
    });

    // GSI1 — query by date (activities and other date-ordered entities).
    this.table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // GSI2 — query by category.
    this.table.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: { name: "GSI2PK", type: AttributeType.STRING },
      sortKey: { name: "GSI2SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // GSI3 — clinical hours by facility.
    this.table.addGlobalSecondaryIndex({
      indexName: "GSI3",
      partitionKey: { name: "GSI3PK", type: AttributeType.STRING },
      sortKey: { name: "GSI3SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // GSI4 — TEAS scores by date.
    this.table.addGlobalSecondaryIndex({
      indexName: "GSI4",
      partitionKey: { name: "GSI4PK", type: AttributeType.STRING },
      sortKey: { name: "GSI4SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    putOutput(this, config, "tableName", this.table.tableName, "DynamoDB single-table name");
    putOutput(this, config, "tableArn", this.table.tableArn, "DynamoDB single-table ARN");

    new CfnOutput(this, "TableName", { value: this.table.tableName });
    new CfnOutput(this, "TableArn", { value: this.table.tableArn });

    // --- Private documents bucket (v2.1 F2) ---
    // Family file uploads (certs, essays, rec letters, transcripts). NEVER public — all access is via
    // short-lived presigned URLs minted by the API Lambda. CORS allows the browser to PUT/GET directly.
    this.documentsBucket = new Bucket(this, "DocumentsBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy,
      // staging is ephemeral (destroy → empty first); prod retains.
      autoDeleteObjects: config.removalPolicy !== "retain",
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
          allowedOrigins: [`https://${envHostname(config)}`, "http://localhost:5173"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    putOutput(this, config, "documentsBucket", this.documentsBucket.bucketName, "Documents S3 bucket");
    new CfnOutput(this, "DocumentsBucketName", { value: this.documentsBucket.bucketName });
  }
}
