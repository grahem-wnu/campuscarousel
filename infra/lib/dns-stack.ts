import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone, type IHostedZone, PublicHostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";
import type { EnvConfig } from "./config";
import { putOutput } from "./ssm";

export interface DnsStackProps extends StackProps {
  readonly config: EnvConfig;
}

/**
 * DnsStack — OPTIONAL, gated on the Gate-1 domain decision. Only instantiated when
 * config.dnsMode != "defer", so `cdk synth` of the default (deferred) app never needs a
 * live account/zone lookup.
 *
 * - "create": provision a new public hosted zone for the domain (NS delegation handled
 *   at the registrar / via Route53 domain registration).
 * - "import": reference an already-owned zone by id (supplied via context `hostedZoneId`)
 *   — uses fromHostedZoneAttributes (no `fromLookup`, so synth stays credential-free).
 *
 * NOTE (apply-time): CloudFront requires its ACM certificate in us-east-1. These stacks
 * run in us-east-2, so at deploy this cert must be provisioned in us-east-1 (set this
 * stack's env region to us-east-1, or use a us-east-1 sub-stack). Synth is unaffected.
 */
export class DnsStack extends Stack {
  public readonly hostedZone: IHostedZone;
  public readonly certificate: Certificate;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);
    const { config } = props;

    if (config.dnsMode === "import") {
      const hostedZoneId =
        (this.node.tryGetContext("hostedZoneId") as string | undefined) ?? "ZONEPLACEHOLDER";
      this.hostedZone = HostedZone.fromHostedZoneAttributes(this, "Zone", {
        hostedZoneId,
        zoneName: config.domainName,
      });
    } else {
      this.hostedZone = new PublicHostedZone(this, "Zone", {
        zoneName: config.domainName,
      });
    }

    // Cover the apex and a wildcard so every env subdomain (staging.*, etc.) is valid.
    this.certificate = new Certificate(this, "Cert", {
      domainName: config.domainName,
      subjectAlternativeNames: [`*.${config.domainName}`],
      validation: CertificateValidation.fromDns(this.hostedZone),
    });

    putOutput(this, config, "hostedZoneId", this.hostedZone.hostedZoneId, "Route53 hosted zone id");
    putOutput(this, config, "certificateArn", this.certificate.certificateArn, "ACM certificate ARN");

    new CfnOutput(this, "HostedZoneId", { value: this.hostedZone.hostedZoneId });
    new CfnOutput(this, "CertificateArn", { value: this.certificate.certificateArn });
  }
}
