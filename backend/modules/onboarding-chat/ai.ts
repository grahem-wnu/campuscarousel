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
    'name' | 'graduationYear' | 'currentGPA' | 'gpaType' | 'careerGoal' | 'intendedMajors' | 'location' | 'highSchool' | 'interests'
  >
> & { budgetTotal?: number };

export interface OnboardingTurn {
  reply: string;
  profile: OnboardingProfile;
  done: boolean;
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
  // School year runs ~Aug–May. In spring/summer (before August) a 12th grader graduates THIS year;
  // once the next school year has started (August+), they graduate next year.
  const g12 = month >= 7 ? y + 1 : y;
  return [
    `Today is ${now.toISOString().slice(0, 10)}.`,
    'Convert a US grade to graduation year (spring graduation, school year ~Aug–May) using exactly:',
    `12th/senior → ${g12}, 11th/junior → ${g12 + 1}, 10th/sophomore → ${g12 + 2}, 9th/freshman → ${g12 + 3}.`,
    'Do the math from these — never guess the year.',
  ].join(' ');
}

function buildSystem(now: Date): string {
  return [
    'You are a warm, encouraging college-prep guide onboarding a family on Campus Carousel. Your job is a',
    'short, friendly conversation that builds the student’s starting profile — not an interrogation.',
    'Gather, a couple of things at a time and reacting naturally to answers: the student’s name,',
    'graduation year (or current grade), intended major(s), career goal, current GPA (and weighted vs',
    'unweighted), city & state, a few interests/activities, and a rough family college budget. It is fine',
    'if they don’t know something — skip it gracefully and move on. Keep each message brief.',
    'Record the student’s NAME exactly as the family writes it — never correct spelling, change it, or add',
    'a last name they didn’t give. If unsure, ask; do not assume.',
    gradYearGuide(now),
    'When you have a reasonable picture (at least a major or career goal, plus grade/grad year and a couple',
    'more details), wrap up: warmly summarize what you heard in one or two sentences and set done=true.',
    '',
    'ALWAYS respond with ONLY a single JSON object — no prose outside it, no code fences:',
    '{"reply": "<your next message to the family>", "profile": { <all fields gathered so far, CUMULATIVE> }, "done": <true once setup is complete>}',
    'profile keys (include ONLY what you actually know): name (string), graduationYear (number),',
    'currentGPA (number), gpaType ("weighted"|"unweighted"), careerGoal (string), intendedMajors (string[]),',
    'location (string), highSchool (string), interests (string[]), budgetTotal (number, USD).',
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
    return {
      reply: reply || 'Tell me a little more.',
      profile: (obj.profile && typeof obj.profile === 'object' ? obj.profile : {}) as OnboardingProfile,
      done: obj.done === true,
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
 *  college hydration pipeline enriches each afterward). Returns [] on any error. */
export type CollegeSeeder = (majors: string[], location?: string) => Promise<SeedCollege[]>;

export function makeBedrockCollegeSeeder(options: AiOptions = {}): CollegeSeeder {
  return async (majors, location) => {
    const focus = majors.length ? majors.join(' / ') : 'undergraduate';
    const prompt = [
      `List 4 real, currently-operating US colleges or universities with strong ${focus} programs.`,
      'Give a realistic mix — one reach, a couple of solid targets, one accessible option.',
      location ? `The student is in ${location}; include at least one strong in-state public option if it fits.` : '',
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
      if (start === -1 || end <= start) return [];
      const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr
        .map((c) => {
          const obj = (c ?? {}) as { name?: unknown; state?: unknown };
          return { name: String(obj.name ?? '').trim(), state: obj.state ? String(obj.state).trim() : undefined };
        })
        .filter((c) => c.name.length > 0);
    } catch {
      return [];
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
