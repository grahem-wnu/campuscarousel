import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AllowedMethods,
  Distribution,
  HttpVersion,
  PriceClass,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { BlockPublicAccess, Bucket, BucketEncryption, type IBucket } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";
import { putOutput } from "./ssm";

export interface AssetsStackProps extends StackProps {
  readonly config: EnvConfig;
}

/**
 * AssetsStack — College Hub media (campus photos + cached logos).
 *
 * A PRIVATE S3 bucket behind CloudFront via Origin Access Control (OAC), exactly like WebStack
 * but for user-facing imagery instead of the SPA. The bucket blocks all public access; only the
 * distribution can read it. Served on the default *.cloudfront.net domain (no custom domain / cert
 * needed for images). The async assets worker writes objects here and stores the resulting
 * CloudFront url on the college, so the frontend reads it directly with no extra config.
 */
export class AssetsStack extends Stack {
  public readonly bucket: IBucket;
  public readonly baseUrl: string;
  public readonly distributionId: string;

  constructor(scope: Construct, id: string, props: AssetsStackProps) {
    super(scope, id, props);
    const { config } = props;

    const removalPolicy =
      config.removalPolicy === "retain" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    const bucket = new Bucket(this, "AssetsBucket", {
      bucketName: `${config.namePrefix}-assets-${this.account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy,
      // Only staging is disposable; prod retains its objects.
      autoDeleteObjects: config.removalPolicy === "destroy",
    });

    const distribution = new Distribution(this, "AssetsDistribution", {
      comment: `${config.namePrefix} college media`,
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        // OAC origin — bucket stays private; CDK wires the bucket policy automatically.
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        compress: true,
      },
    });

    this.bucket = bucket;
    this.baseUrl = `https://${distribution.distributionDomainName}`;
    this.distributionId = distribution.distributionId;

    putOutput(this, config, "assetsBucketName", bucket.bucketName, "College media S3 bucket");
    putOutput(this, config, "assetsBaseUrl", this.baseUrl, "College media CDN base URL");
    putOutput(this, config, "assetsDistributionId", distribution.distributionId, "College media CloudFront id");

    new CfnOutput(this, "AssetsBaseUrl", { value: this.baseUrl });
    new CfnOutput(this, "AssetsBucketName", { value: bucket.bucketName });
    new CfnOutput(this, "AssetsDistributionId", { value: distribution.distributionId });
  }
}
