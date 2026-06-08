// The module's data calls. Thin wrappers over the shared typed API client.

import { api } from '../../shared/api';
import type { Analysis, TimelineEvent, TimelineFilters, UpcomingEvent } from './types';

export async function getTimeline(filters: TimelineFilters = {}): Promise<TimelineEvent[]> {
  const res = await api.get<{ events: TimelineEvent[] }>('/timeline', {
    query: { from: filters.from, to: filters.to, source: filters.source, type: filters.type },
  });
  return res.events;
}

export async function getUpcoming(horizon?: number): Promise<UpcomingEvent[]> {
  const res = await api.get<{ events: UpcomingEvent[]; horizon: number }>('/timeline/upcoming', { query: { horizon } });
  return res.events;
}

export async function analyzeTimeline(horizonDays?: number): Promise<Analysis> {
  const res = await api.post<{ analysis: Analysis }>('/timeline/analyze', horizonDays ? { horizonDays } : {});
  return res.analysis;
}
