// The module's data calls. Thin wrappers over the shared typed API client (which attaches the
// Amplify ID token and parses the error envelope). Modules never use raw fetch.

import { api } from '../../shared/api';
import type { AggregateMatrix, BenchmarkDetail, GapsAnalysis, RefreshInput } from './types';

export function getBenchmark(collegeId: string): Promise<BenchmarkDetail> {
  return api.get<BenchmarkDetail>(`/colleges/${encodeURIComponent(collegeId)}/benchmark`);
}

export function refreshBenchmark(collegeId: string, input: RefreshInput = {}): Promise<BenchmarkDetail> {
  return api.post<BenchmarkDetail>(`/colleges/${encodeURIComponent(collegeId)}/benchmark/refresh`, input);
}

export function getAggregate(): Promise<AggregateMatrix> {
  return api.get<AggregateMatrix>('/benchmarks/aggregate');
}

export function getGaps(): Promise<GapsAnalysis> {
  return api.get<GapsAnalysis>('/benchmarks/gaps');
}
