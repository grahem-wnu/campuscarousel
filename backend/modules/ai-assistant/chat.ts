// The assistant's reasoning core: mode resolution, system-prompt assembly, and the model call —
// all pure except the injected `ModelInvoker`, exactly like goal-tracker. The handler reads the DB
// (applying the visibility middleware) and hands this a ready-made, already-filtered ContextBundle,
// so nothing here decides what the model may see — privacy is enforced before the bundle is built.

import { ApiError } from '../../shared/api/index.js';
import { MODES, type ChatContext } from './schema.js';

export type Mode = (typeof MODES)[number];

/** A compact, family-visible numeric snapshot of Keira's progress (no private content). */
export interface DataSummary {
  gpa?: number;
  bestTeas?: number;
  clinicalHours: number;
  volunteerHours: number;
  collegeCount: number;
  goalCount: number;
}

/** One grounding record the model may reference. The handler builds these from records ALREADY
 *  run through `aiVisibleSet` for the caller, so a private record only ever appears here for keira. */
export interface GroundingRecord {
  kind: string;
  text: string;
}

export interface ContextBundle {
  role: string;
  mode: Mode;
  page: { module?: string; collegeId?: string; essayId?: string };
  summary: DataSummary;
  records: GroundingRecord[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  response: string;
  toolsUsed: string[];
  /** Web-search citations. Empty until the Bedrock web-search tool is wired (see PR notes). */
  citations: string[];
}

/** Raw model invocation: system prompt + message turns in, completion text out. Keeps the AWS SDK
 *  out of the pure prompt path so `makeAssistant` is unit-testable with a fake invoker. */
export type ModelInvoker = (system: string, messages: ChatMessage[]) => Promise<string>;

export interface Assistant {
  reply(bundle: ContextBundle, history: ChatMessage[], message: string): Promise<AssistantReply>;
}

/** Resolve the active mode: an explicit `context.mode` wins, else derive from the page module. */
export function resolveMode(context: ChatContext | undefined): Mode {
  if (context?.mode) return context.mode;
  if (context?.essayId || context?.module === 'why-nursing' || context?.module === 'application-central') {
    return 'essay-partner';
  }
  if (context?.module === 'college-hub') return 'college-discovery';
  if (context?.module === 'scholarship-tracker') return 'scholarship-discovery';
  return 'ask';
}

const MODE_GUIDANCE: Record<Mode, string> = {
  ask: 'Answer questions about Keira’s nursing-school journey. You may use the data summary and records below to answer factual questions (e.g. "how many volunteer hours?").',
  'college-discovery':
    'Help discover BSN/nursing programs that fit Keira. When you propose schools, give a short structured list (name, location, why it fits) she can add to her college list.',
  'essay-partner':
    'Be an essay partner. Use Keira’s real experiences below to help her brainstorm, structure, and strengthen her writing. SUGGEST and ask questions — never write the essay for her.',
  'scholarship-discovery':
    'Help discover scholarships Keira may qualify for. Offer a short structured list (name, amount/eligibility, why it fits) she can add to her tracker.',
};

const fmt = (n: number | undefined): string => (typeof n === 'number' ? String(n) : 'n/a');

/** Build the system prompt from the (already visibility-filtered) bundle. Deterministic + pure. */
export function buildSystemPrompt(bundle: ContextBundle): string {
  const lines: string[] = [
    'You are the AI assistant inside "Keira’s Journey", a private app tracking Keira’s path to a BSN (nursing) program.',
    `The current user’s role is "${bundle.role}".`,
    MODE_GUIDANCE[bundle.mode],
  ];
  if (bundle.page.module) lines.push(`The user is on the "${bundle.page.module}" page.`);
  if (bundle.page.collegeId) lines.push(`Current college context id: ${bundle.page.collegeId}.`);

  lines.push(
    '',
    'Keira’s progress snapshot:',
    `- GPA: ${fmt(bundle.summary.gpa)}`,
    `- Best TEAS: ${fmt(bundle.summary.bestTeas)}`,
    `- Clinical hours: ${bundle.summary.clinicalHours}`,
    `- Volunteer hours: ${bundle.summary.volunteerHours}`,
    `- Colleges tracked: ${bundle.summary.collegeCount}`,
    `- Goals: ${bundle.summary.goalCount}`,
  );

  if (bundle.records.length > 0) {
    lines.push('', 'Relevant entries (cite these when helpful):');
    for (const r of bundle.records) lines.push(`- [${r.kind}] ${r.text}`);
  }

  lines.push(
    '',
    'Be warm, specific, and concise. Ground answers in the data above; if you lack data, say so rather than inventing it. Never reveal another user’s private information.',
  );
  return lines.join('\n');
}

/** Tools that contributed to this turn (the DB-grounding "tool"). Web search will add to this. */
export function toolsUsedFor(bundle: ContextBundle): string[] {
  const tools: string[] = [];
  if (bundle.records.length > 0 || bundle.summary.collegeCount >= 0) tools.push('profile-data');
  return tools;
}

/**
 * Compose an assistant from a model invoker. A failed invocation surfaces as a clean 502 (chat is
 * interactive — the UI should say "try again", not render an empty reply as if it were real).
 */
export function makeAssistant(invoke: ModelInvoker): Assistant {
  return {
    async reply(bundle, history, message) {
      const system = buildSystemPrompt(bundle);
      const messages: ChatMessage[] = [...history, { role: 'user', content: message }];
      try {
        const response = (await invoke(system, messages)).trim();
        return { response, toolsUsed: toolsUsedFor(bundle), citations: [] };
      } catch (err) {
        if (err instanceof ApiError) throw err;
        console.error('ai-assistant: model invocation failed', err);
        throw new ApiError(502, 'internal', 'The assistant could not respond right now. Please try again.');
      }
    },
  };
}

/** Fallback when Bedrock isn't configured (local dev / Lambda missing BEDROCK_MODEL_ID): a clean
 *  503 so the chat says "AI isn't enabled here" rather than 500ing. */
export const unavailableAssistant: Assistant = {
  reply() {
    return Promise.reject(new ApiError(503, 'unavailable', 'The AI assistant is not yet enabled in this environment.'));
  },
};
