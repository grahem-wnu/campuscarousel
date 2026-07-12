// Conversational onboarding: a fast, MODEL-ONLY chat turn (no web search → fits the API 30s budget)
// that interviews a family and extracts the student profile as structured JSON. Each turn replays the
// full (short) transcript and returns the guide's next message plus the cumulative profile gathered so
// far and a `done` flag. Injectable (invoker/searcher) so tests run offline. Never throws: a parse
// failure degrades to using the raw text as the reply.

import { converseWithSearch, type BedrockInvoker, type WebSearcher } from '../../shared/ai/index.js';
import type { StudentProfile } from '../../shared/data/index.js';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

/** The profile fields the chat gathers. `budgetTotal` is flattened for the model; the finish handler
 *  maps it back to StudentProfile.budget. */
export type OnboardingProfile = Partial<
  Pick<
    StudentProfile,
    | 'name'
    | 'graduationYear'
    | 'currentGPA'
    | 'gpaType'
    | 'careerGoal'
    | 'intendedMajors'
    | 'location'
    | 'highSchool'
    | 'interests'
    | 'collegesOfInterest'
  >
> & { budgetTotal?: number };

export interface OnboardingTurn {
  reply: string;
  profile: OnboardingProfile;
  done: boolean;
  /** How many students the family said they're setting up (captured once, early in the chat). The
   *  frontend uses it to size the multi-child onboarding loop. Absent until the family answers. */
  studentCount?: number;
}

export type OnboardingChatter = (messages: ChatMsg[]) => Promise<OnboardingTurn>;

export interface AiOptions {
  modelId?: string;
  invoker?: BedrockInvoker;
  searcher?: WebSearcher;
  /** Clock for the grade→graduation-year guide (injectable for tests). */
  now?: () => Date;
}

/** Grade → graduation year for TODAY, computed exactly so the model never has to guess the year. */
export function gradYearGuide(now: Date): string {
  const y = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0=Jan
  // From June onward (school's out for summer) a stated grade is the one the student is ENTERING this
  // fall; Jan–May they're currently in it. So a 12th grader graduates: Jun–Dec → next year, Jan–May →
  // this year. (e.g. "10th grade" in June 2026 = a rising sophomore → graduates 2029.)
  const g12 = month >= 5 ? y + 1 : y;
  return [
    `Today is ${now.toISOString().slice(0, 10)}.`,
    'A US student graduates at the end of 12th grade (spring). From a stated grade, the graduation year is exactly:',
    `12th/senior → ${g12}, 11th/junior → ${g12 + 1}, 10th/sophomore → ${g12 + 2}, 9th/freshman → ${g12 + 3}.`,
    'Use these exactly — never guess the year.',
  ].join(' ');
}

function buildSystem(now: Date): string {
  return [
    'You are a warm, encouraging college-prep guide onboarding a family on Campus Carousel. Your job is a',
    'short, friendly conversation that builds the student’s starting profile — not an interrogation.',
    'FIRST, before anything else, ask how many students (children) the family is setting up today. The',
    'moment they tell you, record it as studentCount (a whole number) and acknowledge it warmly. You only',
    'set up ONE student in this conversation — the app walks the family through the others afterward — so',
    'once the count is known, focus entirely on the FIRST student and do not ask about siblings again.',
    'Then gather, a couple of things at a time and reacting naturally to answers: the student’s name,',
    'graduation year (or current grade), intended major(s), career goal, current GPA (and weighted vs',
    'unweighted), city & state, a few interests/activities, any colleges already on the family’s radar,',
    'and a rough family college budget. It is fine',
    'if they don’t know something — skip it gracefully and move on. Keep each message brief.',
    'If the family names specific colleges at ANY point, record every one in collegesOfInterest exactly',
    'as named — those schools matter to them and must not be lost.',
    'Record the student’s NAME exactly as the family writes it — never correct spelling, change it, or add',
    'a last name they didn’t give. If unsure, ask; do not assume.',
    gradYearGuide(now),
    'When you have a reasonable picture (at least a major or career goal, plus grade/grad year and a couple',
    'more details), wrap up: warmly summarize what you heard in one or two sentences and set done=true.',
    '',
    'ALWAYS respond with ONLY a single JSON object — no prose outside it, no code fences:',
    '{"reply": "<your next message to the family>", "profile": { <all fields gathered so far, CUMULATIVE> }, "done": <true once THIS student’s setup is complete>, "studentCount": <whole number, once the family tells you how many kids>}',
    'Include studentCount as soon as you know it and keep including it on every later turn. Omit it only',
    'until the family has answered. profile keys (include ONLY what you actually know): name (string), graduationYear (number),',
    'currentGPA (number), gpaType ("weighted"|"unweighted"), careerGoal (string), intendedMajors (string[]),',
    'location (string), highSchool (string), interests (string[]), collegesOfInterest (string[], colleges',
    'the family named), budgetTotal (number, USD).',
  ].join(' ');
}

function renderTranscript(messages: ChatMsg[]): string {
  const lines = messages.map((m) => `${m.role === 'user' ? 'Family' : 'Guide'}: ${m.content}`).join('\n');
  return `Conversation so far:\n${lines}\n\nProduce the Guide’s next turn now, as the JSON object only.`;
}

/** Parse the model's JSON turn; degrade to raw text on any failure (chat keeps flowing). */
export function parseTurn(text: string): OnboardingTurn {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no json');
    const obj = JSON.parse(text.slice(start, end + 1)) as Partial<OnboardingTurn>;
    const reply = typeof obj.reply === 'string' ? obj.reply.trim() : '';
    // studentCount is optional; accept only a sane integer (1–12), otherwise drop it.
    const rawCount = typeof obj.studentCount === 'number' ? Math.floor(obj.studentCount) : NaN;
    const studentCount = Number.isFinite(rawCount) && rawCount >= 1 && rawCount <= 12 ? rawCount : undefined;
    return {
      reply: reply || 'Tell me a little more.',
      profile: (obj.profile && typeof obj.profile === 'object' ? obj.profile : {}) as OnboardingProfile,
      done: obj.done === true,
      ...(studentCount !== undefined ? { studentCount } : {}),
    };
  } catch {
    return { reply: text.trim() || 'Could you tell me a bit more?', profile: {}, done: false };
  }
}

export interface SeedCollege {
  name: string;
  state?: string;
}

/** Names a few real colleges for the major (model-only — naming well-known schools needs no web; the
 *  college hydration pipeline enriches each afterward). `mustInclude` = colleges the family explicitly
 *  named; they are guaranteed to lead the result (even on a model error — the family's own picks never
 *  depend on the AI). Returns [] on error only when there's nothing named. */
export type CollegeSeeder = (majors: string[], location?: string, mustInclude?: string[]) => Promise<SeedCollege[]>;

/** Dedupe a list of seed colleges by normalized name (trim + lowercase), preserving order. */
function dedupeByName(colleges: SeedCollege[]): SeedCollege[] {
  const result: SeedCollege[] = [];
  const seen = new Set<string>();
  for (const c of colleges) {
    const name = c.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(c.state ? { name, state: c.state } : { name });
  }
  return result;
}

/**
 * Reconcile the family's named colleges with the model's suggestions into one seed list.
 *
 * When the model returns suggestions (the normal path) they are AUTHORITATIVE: the seeder prompt
 * requires the model to include every family-named school by its full official name, so its list
 * already covers the family's picks — canonicalized. We deliberately do NOT also re-add the family's
 * raw input, because conversational shorthand ("USC", "UC", "Cal State", "U of Hawaii") never string-
 * matches the model's canonical name ("University of Southern California", ...) and would be persisted
 * as a duplicate/fragment college alongside it. Trusting the model's list is the single source of truth.
 *
 * Only when the model returns nothing (an error/empty response) do we fall back to the family's raw
 * names, so a family's own picks are never lost to an AI outage.
 */
export function mergeMustInclude(named: string[], suggested: SeedCollege[]): SeedCollege[] {
  if (suggested.length > 0) return dedupeByName(suggested);
  return dedupeByName(named.map((name) => ({ name: name.trim() })));
}

export function makeBedrockCollegeSeeder(options: AiOptions = {}): CollegeSeeder {
  return async (majors, location, mustInclude = []) => {
    const named = mustInclude.map((n) => n.trim()).filter(Boolean);
    const focus = majors.length ? majors.join(' / ') : 'undergraduate';
    const prompt = [
      `List 12 real, currently-operating US colleges or universities with strong ${focus} programs.`,
      named.length
        ? `The family already named these — include EVERY one, using each school's FULL official name (expand abbreviations/shorthand, e.g. "USC" → "University of Southern California", "U of Hawaii" → "University of Hawaii at Manoa"). If a name is ambiguous (e.g. "UC", "Cal State"), pick the single most likely campus. Family shorthand: ${named.join('; ')}. Fill the rest of the 12 with your own picks.`
        : '',
      'Give a balanced starter list: ~3 reaches, ~6 solid targets, and ~3 accessible/safety options. No duplicates.',
      location ? `The student is in ${location}; include a few strong in-state public options if they fit.` : '',
      'Respond with ONLY a JSON array — no prose, no code fences:',
      '[{"name":"Full College Name","state":"CA"}]',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const { text } = await converseWithSearch(prompt, {
        system: 'You name real, currently-operating US colleges. Never invent schools.',
        webSearch: false,
        maxTokens: 500,
        temperature: 0.4,
        modelId: options.modelId,
        invoker: options.invoker,
        searcher: options.searcher,
      });
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start === -1 || end <= start) return mergeMustInclude(named, []);
      const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (!Array.isArray(arr)) return mergeMustInclude(named, []);
      const suggested = arr
        .map((c) => {
          const obj = (c ?? {}) as { name?: unknown; state?: unknown };
          return { name: String(obj.name ?? '').trim(), state: obj.state ? String(obj.state).trim() : undefined };
        })
        .filter((c) => c.name.length > 0);
      return mergeMustInclude(named, suggested);
    } catch {
      return mergeMustInclude(named, []);
    }
  };
}

export function makeBedrockOnboardingChatter(options: AiOptions = {}): OnboardingChatter {
  const now = options.now ?? (() => new Date());
  return async (messages) => {
    const { text } = await converseWithSearch(renderTranscript(messages), {
      system: buildSystem(now()),
      webSearch: false,
      maxTokens: 900,
      temperature: 0.6,
      modelId: options.modelId,
      invoker: options.invoker,
      searcher: options.searcher,
    });
    return parseTurn(text);
  };
}
