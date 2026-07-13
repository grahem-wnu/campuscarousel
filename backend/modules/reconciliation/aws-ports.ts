// Real AWS SDK v3 adapters for the reconciliation ports. Kept behind the port interfaces so the
// handler stays testable with fakes; only reconcile.ts (the Lambda entry) touches these.
//
// VERIFY-AT-PROD (Bedrock invocation-log schema): the token field path (`input.inputTokenCount` /
// `output.outputTokenCount`) and the gzip/JSONL object layout are confirmed against a real log object
// during the prod verification step. Everything here defaults missing fields to 0 and swallows read
// errors so a schema surprise or an empty/not-yet-populated bucket never throws — it returns zeros.

import { gunzipSync } from 'node:zlib';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { ListObjectsV2Command, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { type AlertPort, type CostExplorerPort, type InvocationLogPort, type MetricsPort } from './ports.js';

const INVOCATION_LOG_PREFIX = 'bedrock-invocation-logs/';

/**
 * Cost Explorer actuals for AWS Bedrock. CE is a GLOBAL service — its client MUST target us-east-1
 * regardless of the app region, or the call fails. Sums UnblendedCost across the window's monthly
 * buckets and converts the decimal-string dollars to integer micro-dollars.
 */
export function costExplorerPort(): CostExplorerPort {
  const client = new CostExplorerClient({ region: 'us-east-1' });
  return {
    async bedrockCostMicros(fromDate, toDate) {
      const res = await client.send(
        new GetCostAndUsageCommand({
          TimePeriod: { Start: fromDate, End: toDate }, // End is exclusive
          Granularity: 'MONTHLY',
          Metrics: ['UnblendedCost'],
          Filter: { Dimensions: { Key: 'SERVICE', Values: ['Amazon Bedrock'] } },
        }),
      );
      let micros = 0;
      for (const bucket of res.ResultsByTime ?? []) {
        const amount = bucket.Total?.UnblendedCost?.Amount;
        if (amount) micros += Math.round(parseFloat(amount) * 1_000_000);
      }
      return micros;
    },
  };
}

/**
 * Sum input+output tokens from Bedrock model-invocation logs in S3 for the window. Lists objects under
 * the log prefix, filters by LastModified into [fromIso, toIso), reads each (gunzip if `.gz`), parses
 * JSONL, and sums `input.inputTokenCount` + `output.outputTokenCount`. Any failure → zeros (defensive).
 */
export function invocationLogPort(bucket: string): InvocationLogPort {
  const client = new S3Client({});
  return {
    async tokenTotals(fromIso, toIso) {
      const from = new Date(fromIso).getTime();
      const to = new Date(toIso).getTime();
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        let continuationToken: string | undefined;
        do {
          const list = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: INVOCATION_LOG_PREFIX,
              ContinuationToken: continuationToken,
            }),
          );
          for (const obj of list.Contents ?? []) {
            if (!obj.Key) continue;
            const modified = obj.LastModified ? obj.LastModified.getTime() : undefined;
            if (modified !== undefined && (modified < from || modified >= to)) continue;
            const totals = await readObjectTokens(client, bucket, obj.Key);
            inputTokens += totals.inputTokens;
            outputTokens += totals.outputTokens;
          }
          continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
        } while (continuationToken);
      } catch (err) {
        console.error('reconcile: invocation-log read failed (returning zeros)', err);
      }
      return { inputTokens, outputTokens };
    },
  };
}

async function readObjectTokens(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<{ inputTokens: number; outputTokens: number }> {
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return { inputTokens, outputTokens };
    const raw = key.endsWith('.gz') ? gunzipSync(Buffer.from(bytes)) : Buffer.from(bytes);
    for (const line of raw.toString('utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as { input?: { inputTokenCount?: number }; output?: { outputTokenCount?: number } };
        inputTokens += Number(rec.input?.inputTokenCount ?? 0);
        outputTokens += Number(rec.output?.outputTokenCount ?? 0);
      } catch {
        // Skip a malformed line rather than fail the whole object.
      }
    }
  } catch (err) {
    console.error('reconcile: invocation-log object read failed', key, err);
  }
  return { inputTokens, outputTokens };
}

/** Publish a drift alert to the existing ObservabilityStack SNS alarm topic. */
export function snsAlertPort(topicArn: string): AlertPort {
  const client = new SNSClient({});
  return {
    async publish(subject, message) {
      await client.send(
        new PublishCommand({
          TopicArn: topicArn,
          // SNS caps Subject at 100 chars and forbids newlines.
          Subject: `[keiras-journey] ${subject}`.slice(0, 100),
          Message: message,
        }),
      );
    },
  };
}

/** Emit reconciliation gauges to CloudWatch, dimensioned by Stage, so drift is graphable/alarmable. */
export function cwMetricsPort(namespace: string): MetricsPort {
  const client = new CloudWatchClient({});
  const stage = process.env.STAGE ?? 'prod';
  return {
    async emit(m) {
      const dimensions = [{ Name: 'Stage', Value: stage }];
      const metricData: {
        MetricName: string;
        Value: number;
        Unit: 'Count' | 'Percent';
        Dimensions: { Name: string; Value: string }[];
      }[] = [{ MetricName: 'AppCostMicros', Value: m.appCostMicros, Unit: 'Count', Dimensions: dimensions }];
      // Omit the AWS gauges when actuals were unavailable — don't emit a misleading 0.
      if (m.awsCostMicros != null) {
        metricData.push({ MetricName: 'AwsCostMicros', Value: m.awsCostMicros, Unit: 'Count', Dimensions: dimensions });
      }
      if (m.driftPct != null) {
        metricData.push({ MetricName: 'DriftPct', Value: m.driftPct, Unit: 'Percent', Dimensions: dimensions });
      }
      await client.send(new PutMetricDataCommand({ Namespace: namespace, MetricData: metricData }));
    },
  };
}
