// Trip planning for POST /visits/trip-plan.
//
// The spec calls for Bedrock to group nearby schools into itineraries ("Iowa + Michigan, spring
// break"). Behind an injectable `TripPlanner` seam:
//   • makeBedrockTripPlanner — asks Bedrock for an itinerary blurb per regional cluster (model id
//     from BEDROCK_MODEL_ID; lazy SDK import; injectable client). Falls back to curated on error.
//   • curatedTripPlan — deterministic: clusters colleges by state/region and writes a sensible
//     itinerary line per cluster. No network/clock — safe in tests and as the fallback.
//
// Clustering itself is pure and shared by both, so "which schools group together" is always
// deterministic; only the itinerary prose is model-enhanced.

import type { College } from '../../shared/data/index.js';

export interface ClusterCollege {
  collegeId: string;
  name: string;
  location?: string;
}

export interface TripCluster {
  /** State or region the cluster is grouped under. */
  region: string;
  colleges: ClusterCollege[];
  itinerary: string;
}

export interface TripPlan {
  clusters: TripCluster[];
  source: 'ai' | 'curated';
}

const has = (s?: string): s is string => typeof s === 'string' && s.trim().length > 0;

/** Region for clustering: explicit `state`, else the last comma-segment of `location`, else "Other". */
export function regionOf(college: College): string {
  if (has(college.state)) return college.state.trim();
  if (has(college.location)) {
    const parts = college.location.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return 'Other';
}

/** Pure clustering: group colleges by region, largest clusters first, capped at `maxClusters`. */
export function clusterByRegion(colleges: readonly College[], maxClusters?: number): TripCluster[] {
  const byRegion = new Map<string, ClusterCollege[]>();
  for (const c of colleges) {
    const region = regionOf(c);
    const entry = byRegion.get(region) ?? [];
    entry.push({ collegeId: c.collegeId, name: c.name, location: has(c.location) ? c.location : undefined });
    byRegion.set(region, entry);
  }
  let clusters = [...byRegion.entries()]
    .map(([region, list]) => ({ region, colleges: list, itinerary: curatedItinerary(region, list) }))
    .sort((a, b) => (b.colleges.length - a.colleges.length) || (a.region < b.region ? -1 : 1));
  if (maxClusters && maxClusters > 0) clusters = clusters.slice(0, maxClusters);
  return clusters;
}

/** Deterministic itinerary line for a cluster. */
function curatedItinerary(region: string, colleges: readonly ClusterCollege[]): string {
  const names = colleges.map((c) => c.name).join(', ');
  if (colleges.length === 1) {
    return `Plan a focused ${region} trip to ${names} — book the nursing-department tour in advance and visit while classes are in session.`;
  }
  return `Group these ${colleges.length} ${region} schools into one trip (${names}). Cluster the visits across a few days (e.g. a school break) to share travel, and book each nursing-department tour ahead.`;
}

/** Deterministic curated trip plan: pure clustering with curated itinerary lines. */
export const curatedTripPlan = async (
  colleges: readonly College[],
  maxClusters?: number,
): Promise<TripPlan> => ({
  clusters: clusterByRegion(colleges, maxClusters),
  source: 'curated',
});

export type TripPlanner = (colleges: readonly College[], maxClusters?: number) => Promise<TripPlan>;

// ---------------------------------------------------------------------------
// Bedrock-backed trip planner (production). Lazy SDK import; model id from BEDROCK_MODEL_ID.
// ---------------------------------------------------------------------------

export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}

export interface BedrockTripPlannerOptions {
  modelId?: string;
  client?: BedrockInvoker;
  fallback?: TripPlanner;
}

function buildPrompt(clusters: readonly TripCluster[]): string {
  const lines = clusters
    .map((c) => `- ${c.region}: ${c.colleges.map((x) => x.name).join(', ')}`)
    .join('\n');
  return [
    'A BSN applicant wants to group campus visits into efficient trips. Here are schools grouped by region:',
    lines,
    'For each region, write a one-sentence itinerary suggestion (when to go, how to cluster the visits).',
    'Respond with ONLY a JSON array (no prose, no code fences): [{"region": string, "itinerary": string}].',
  ].join('\n');
}

function parseItineraries(decoded: unknown): Map<string, string> {
  const content = (decoded as { content?: Array<{ text?: string }> })?.content;
  const text = Array.isArray(content) ? content.map((c) => c?.text ?? '').join('\n') : '';
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('no JSON array in model output');
  const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(arr)) throw new Error('not an array');
  const out = new Map<string, string>();
  for (const item of arr) {
    const o = item as Record<string, unknown>;
    if (typeof o?.region === 'string' && typeof o?.itinerary === 'string' && o.itinerary.trim()) {
      out.set(o.region, o.itinerary.trim());
    }
  }
  return out;
}

/**
 * Production trip planner: deterministic clustering, then ask Bedrock to refine each cluster's
 * itinerary line. Gracefully falls back to the curated plan on any problem. Never throws.
 */
export function makeBedrockTripPlanner(options: BedrockTripPlannerOptions = {}): TripPlanner {
  const fallback = options.fallback ?? curatedTripPlan;
  return async (colleges, maxClusters) => {
    const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
    const clusters = clusterByRegion(colleges, maxClusters);
    if (!modelId || clusters.length === 0) return fallback(colleges, maxClusters);
    try {
      const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
      const client: BedrockInvoker = options.client ?? (new BedrockRuntimeClient({}) as unknown as BedrockInvoker);
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 800,
            messages: [{ role: 'user', content: buildPrompt(clusters) }],
          }),
        ),
      });
      const res = await client.send(command);
      if (!res.body) return fallback(colleges, maxClusters);
      const decoded = JSON.parse(new TextDecoder().decode(res.body)) as unknown;
      const refined = parseItineraries(decoded);
      return {
        clusters: clusters.map((c) => ({ ...c, itinerary: refined.get(c.region) ?? c.itinerary })),
        source: 'ai',
      };
    } catch {
      return fallback(colleges, maxClusters);
    }
  };
}
