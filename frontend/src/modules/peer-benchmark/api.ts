// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type { AggregateMatrix, BenchmarkDetail, BenchmarkRefreshJob, GapsAnalysis, RefreshInput } from './types';

export function getBenchmark(collegeId: string): Promise<BenchmarkDetail> {
  return api.get<BenchmarkDetail>(`/colleges/${encodeURIComponent(collegeId)}/benchmark`);
}

/** Start an async refresh job. Web-grounded research runs on the SQS worker (it can exceed the 30s
 *  request budget); poll `getRefreshStatus` until it settles, then reload the benchmark. */
export function startBenchmarkRefresh(collegeId: string, input: RefreshInput = {}): Promise<BenchmarkRefreshJob> {
  return api.post<BenchmarkRefreshJob>(`/colleges/${encodeURIComponent(collegeId)}/benchmark/refresh`, input);
}

/** Poll a refresh job's status + result. */
export function getRefreshStatus(collegeId: string, jobId: string): Promise<BenchmarkRefreshJob> {
  return api.get<BenchmarkRefreshJob>(
    `/colleges/${encodeURIComponent(collegeId)}/benchmark/refresh/${encodeURIComponent(jobId)}`,
  );
}

export function getAggregate(): Promise<AggregateMatrix> {
  return api.get<AggregateMatrix>('/benchmarks/aggregate');
}

export function getGaps(): Promise<GapsAnalysis> {
  return api.get<GapsAnalysis>('/benchmarks/gaps');
}
