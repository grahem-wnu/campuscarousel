// Lambda entry for the PROD-ONLY scheduled reconciliation job (AsyncStack, daily). EventBridge fires
// it; it recomputes per-tenant monthly rollups, reconciles the app's summed Bedrock cost/tokens
// against AWS actuals (Cost Explorer $ + invocation-log tokens), stores a status row, emits metrics,
// and alerts on drift beyond the threshold. Wires the real AWS SDK adapters onto runReconciliation.
//
// The alarm-topic ARN is resolved from SSM at RUNTIME (not injected at deploy time) to avoid the
// AsyncStack-before-ObservabilityStack deploy-ordering hazard — by the time the daily schedule fires,
// obs has long since written `${SSM_PREFIX}/alarmTopicArn`.

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { dataFromEnv, tableClientFromEnv } from '../shared/data/index.js';
import { runReconciliation } from '../modules/reconciliation/reconcile.js';
import {
  costExplorerPort,
  invocationLogPort,
  snsAlertPort,
  cwMetricsPort,
} from '../modules/reconciliation/aws-ports.js';

async function readSsmParam(name: string): Promise<string> {
  const client = new SSMClient({});
  const res = await client.send(new GetParameterCommand({ Name: name }));
  const value = res.Parameter?.Value;
  if (!value) throw new Error(`reconcile: SSM parameter ${name} has no value`);
  return value;
}

export const handler = async (): Promise<unknown> => {
  const bucket = process.env.RECON_LOG_BUCKET;
  const ssmPrefix = process.env.SSM_PREFIX;
  const thresholdPct = Number(process.env.RECON_DRIFT_THRESHOLD_PCT ?? '5');
  if (!bucket || !ssmPrefix) throw new Error('reconcile: RECON_LOG_BUCKET / SSM_PREFIX not set');

  const topicArn = await readSsmParam(`${ssmPrefix}/alarmTopicArn`);
  const result = await runReconciliation({
    data: dataFromEnv(),
    baseClient: tableClientFromEnv(),
    costExplorer: costExplorerPort(),
    logs: invocationLogPort(bucket),
    alert: snsAlertPort(topicArn),
    metrics: cwMetricsPort('KeirasJourney/Metering'),
    now: () => new Date().toISOString(),
    thresholdPct,
  });
  console.log('reconcile:', JSON.stringify(result));
  return result;
};
