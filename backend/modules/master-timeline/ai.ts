// AI layer for the master timeline: POST /timeline/analyze → priorities, conflicts (overlapping
// deadlines), and missing items. Bedrock-backed behind an injectable seam with a deterministic
// curated fallback (model id from BEDROCK_MODEL_ID, never hardcoded). The caller passes the already
// visibility-filtered upcoming events, so this layer can't leak private data; output is returned live.

import { daysUntil, type TimelineEvent, type UpcomingEvent } from './events.js';

export interface BedrockInvoker {
  send(command: unknown): Promise<{ body?: Uint8Array }>;
}
export interface AiOptions {
  modelId?: string;
  client?: BedrockInvoker;
}

export interface Analysis {
  priorities: string[];
  conflicts: string[];
  missing: string[];
  source: 'ai' | 'curated';
}
export type Analyzer = (input: { events: readonly UpcomingEvent[]; allEvents: readonly TimelineEvent[]; todayIso: string }) => Promise<Analysis>;

const DEADLINE_SOURCES = new Set(['college', 'scholarship', 'goal', 'certification']);

// ---- Curated (deterministic) ----------------------------------------------

export const curatedAnalyzer: Analyzer = async ({ events, allEvents }) => {
  const priorities: string[] = [];
  for (const e of events.filter((x) => x.group === 'overdue' || x.group === 'this-week').slice(0, 4)) {
    priorities.push(e.daysUntil < 0 ? `⚠️ Overdue: ${e.title} (${Math.abs(e.daysUntil)}d ago)` : `${e.title} — in ${e.daysUntil}d`);
  }
  if (priorities.length === 0 && events[0]) priorities.push(`Next up: ${events[0].title} in ${events[0].daysUntil}d`);

  // Conflicts: two deadline-type events within 3 days of each other.
  const conflicts: string[] = [];
  const deadlines = events.filter((e) => DEADLINE_SOURCES.has(e.source));
  for (let i = 0; i < deadlines.length; i++) {
    for (let j = i + 1; j < deadlines.length; j++) {
      const gap = Math.abs(deadlines[i]!.daysUntil - deadlines[j]!.daysUntil);
      if (gap <= 3) conflicts.push(`"${deadlines[i]!.title}" and "${deadlines[j]!.title}" are ${gap === 0 ? 'on the same day' : `${gap}d apart`} — plan ahead.`);
    }
  }

  const missing: string[] = [];
  if (!allEvents.some((e) => e.source === 'teas')) missing.push('No TEAS exam date on the calendar — schedule one.');
  if (!allEvents.some((e) => e.source === 'college')) missing.push('No college application deadlines yet — add your target schools’ dates.');
  if (!allEvents.some((e) => e.source === 'visit')) missing.push('No campus visits planned — visits boost demonstrated interest.');
  if (missing.length === 0) missing.push('Good coverage — exams, applications, and visits are all on the calendar.');

  return { priorities, conflicts: conflicts.slice(0, 5), missing, source: 'curated' };
};

// ---- Bedrock-backed (with curated fallback) -------------------------------

async function invokeText(prompt: string, options: AiOptions): Promise<string> {
  const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client: BedrockInvoker = options.client ?? (new BedrockRuntimeClient({}) as unknown as BedrockInvoker);
  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(
      JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    ),
  });
  const res = await client.send(command);
  if (!res.body) throw new Error('empty Bedrock response');
  const decoded = JSON.parse(new TextDecoder().decode(res.body)) as { content?: Array<{ text?: string }> };
  return (decoded.content ?? []).map((c) => (typeof c?.text === 'string' ? c.text : '')).join('\n');
}

export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '');
  const o = t.indexOf('{');
  const a = t.indexOf('[');
  const start = a === -1 ? o : o === -1 ? a : Math.min(o, a);
  if (start === -1) throw new Error('no JSON in model output');
  const close = t[start] === '[' ? ']' : '}';
  const end = t.lastIndexOf(close);
  if (end <= start) throw new Error('unterminated JSON');
  return JSON.parse(t.slice(start, end + 1));
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function buildPrompt(events: readonly UpcomingEvent[], todayIso: string): string {
  const compact = events.slice(0, 40).map((e) => ({ date: e.date, in: e.daysUntil, source: e.source, title: e.title }));
  return [
    'You are a college-applicant planning coach. Given today and the upcoming timeline events, identify',
    'what to prioritize, any conflicts (overlapping/clustered deadlines, double-booked weekends), and',
    'likely missing items (no exam date, no app deadlines, no visits). Respond with ONLY JSON (no',
    'prose/fences): {"priorities": string[], "conflicts": string[], "missing": string[]}.',
    `Today: ${todayIso}.`,
    `Events: ${JSON.stringify(compact)}.`,
  ].join('\n');
}

export function makeBedrockAnalyzer(options: AiOptions = {}, fallback: Analyzer = curatedAnalyzer): Analyzer {
  return async (input) => {
    try {
      const raw = extractJson(await invokeText(buildPrompt(input.events, input.todayIso), options)) as Record<string, unknown>;
      const priorities = strArr(raw.priorities);
      const conflicts = strArr(raw.conflicts);
      const missing = strArr(raw.missing);
      if (priorities.length === 0 && conflicts.length === 0 && missing.length === 0) return fallback(input);
      return { priorities, conflicts, missing, source: 'ai' };
    } catch {
      return fallback(input);
    }
  };
}

// re-export for the handler's convenience.
export { daysUntil };
