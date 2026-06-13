import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AllowedMethods,
  Distribution,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import type { IHostedZone } from "aws-cdk-lib/aws-route53";
import { AaaaRecord, ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";
import { envHostname } from "./config";
import { putOutput } from "./ssm";

export interface WebStackProps extends StackProps {
  readonly config: EnvConfig;
  /** Provided only when DNS is not deferred (Gate-1 domain decision). */
  readonly certificate?: ICertificate;
  readonly hostedZone?: IHostedZone;
}

/**
 * WebStack — the SPA host: a PRIVATE S3 bucket behind CloudFront via Origin Access
 * Control (OAC). The bucket blocks all public access; only the distribution can read
 * it. SPA deep links fall back to index.html (403/404 -> 200 /index.html).
 *
 * When a certificate + hosted zone are supplied (domain owned/created at Gate 1), the
 * distribution serves the env hostname over TLS and an alias A record is created.
 * Otherwise it serves on the default *.cloudfront.net domain (deferred-DNS path), so
 * synth and deploy both work with or without the domain.
 */
export class WebStack extends Stack {
  public readonly distributionId: string;
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const { config, certificate, hostedZone } = props;

    const removalPolicy =
      config.removalPolicy === "retain" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    const bucket = new Bucket(this, "SiteBucket", {
      bucketName: `${config.namePrefix}-web-${this.account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: config.stage === "prod",
      removalPolicy,
      // Only staging is disposable; prod retains its objects.
      autoDeleteObjects: config.removalPolicy === "destroy",
    });

    const useCustomDomain = Boolean(certificate && hostedZone);
    const domainNames = useCustomDomain ? [envHostname(config)] : undefined;

    // Security headers on every response. The CSP is scoped to what the SPA actually loads:
    // self-hosted Vite bundles (no inline scripts), Google Fonts (stylesheet + woff2), and
    // https/data images (logos + AI-hydrated campus photos from arbitrary hosts). connect-src
    // covers Cognito + the API over https. Tightening script-src later needs a browser QA pass.
    const securityHeaders = new ResponseHeadersPolicy(this, "SecurityHeaders", {
      responseHeadersPolicyName: `${config.namePrefix}-security-headers`,
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: https:",
            "connect-src 'self' https:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "object-src 'none'",
          ].join("; "),
          override: true,
        },
      },
    });

    const distribution = new Distribution(this, "Distribution", {
      comment: `${config.namePrefix} SPA`,
      defaultRootObject: "index.html",
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      certificate: useCustomDomain ? certificate : undefined,
      domainNames,
      defaultBehavior: {
        // OAC origin — bucket stays private; CDK wires the bucket policy automatically.
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        responseHeadersPolicy: securityHeaders,
        compress: true,
      },
      // SPA client-side routing: serve index.html for unknown paths.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) },
      ],
    });

    if (useCustomDomain && hostedZone) {
      const recordName = config.subdomain || undefined;
      const aliasTarget = RecordTarget.fromAlias(new CloudFrontTarget(distribution));
      // IPv4 + IPv6 alias to the distribution (CloudFront serves dual-stack).
      new ARecord(this, "AliasRecord", { zone: hostedZone, recordName, target: aliasTarget });
      new AaaaRecord(this, "AliasRecordIpv6", { zone: hostedZone, recordName, target: aliasTarget });
    }

    this.distributionId = distribution.distributionId;
    this.bucketName = bucket.bucketName;

    putOutput(this, config, "webBucketName", bucket.bucketName, "SPA S3 bucket");
    putOutput(this, config, "distributionId", distribution.distributionId, "CloudFront distribution id");
    putOutput(this, config, "distributionDomain", distribution.distributionDomainName, "CloudFront domain");
    if (useCustomDomain) {
      putOutput(this, config, "siteUrl", `https://${envHostname(config)}`, "Public site URL");
    }

    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new CfnOutput(this, "DistributionDomain", { value: distribution.distributionDomainName });
  }
}
