// Injectable ports for the reconciliation job. The handler (reconcile.ts) depends only on these
// interfaces so it is fully unit-testable with fakes; aws-ports.ts wires the real AWS SDK clients.

export interface CostExplorerPort {
  /** Actual AWS Bedrock cost (micro-dollars) for [fromDate, toDate) — unblended, summed across every
   *  SERVICE whose name looks like Bedrock (AWS bills per model, e.g. "Claude Sonnet 4.6 (Amazon
   *  Bedrock Edition)"; there is no service literally named "Amazon Bedrock").
   *  Dates are `YYYY-MM-DD` (Cost Explorer's End is exclusive). */
  bedrockCostMicros(fromDate: string, toDate: string): Promise<number>;
}

export interface InvocationLogPort {
  /** Summed input+output tokens from Bedrock model-invocation logs for [fromIso, toIso). */
  tokenTotals(fromIso: string, toIso: string): Promise<{ inputTokens: number; outputTokens: number }>;
}

export interface AlertPort {
  publish(subject: string, message: string): Promise<void>;
}

export interface MetricsPort {
  emit(metrics: {
    appCostMicros: number;
    /** null/undefined when AWS actuals were unavailable this run — the adapter omits the AWS gauges. */
    awsCostMicros?: number | null;
    driftPct?: number | null;
    month: string;
  }): Promise<void>;
}
