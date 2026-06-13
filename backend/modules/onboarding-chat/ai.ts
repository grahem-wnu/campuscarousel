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
}

const SYSTEM = [
  'You are a warm, encouraging college-prep guide onboarding a family on Campus Carousel. Your job is a',
  'short, friendly conversation that builds the student’s starting profile — not an interrogation.',
  'Gather, a couple of things at a time and reacting naturally to answers: the student’s first name,',
  'graduation year (or current grade), intended major(s), career goal, current GPA (and weighted vs',
  'unweighted), city & state, a few interests/activities, and a rough family college budget. It is fine',
  'if they don’t know something — skip it gracefully and move on. Keep each message brief.',
  'When you have a reasonable picture (at least a major or career goal, plus grade/grad year and a couple',
  'more details), wrap up: warmly summarize what you heard in one or two sentences and set done=true.',
  '',
  'ALWAYS respond with ONLY a single JSON object — no prose outside it, no code fences:',
  '{"reply": "<your next message to the family>", "profile": { <all fields gathered so far, CUMULATIVE> }, "done": <true once setup is complete>}',
  'profile keys (include ONLY what you actually know): name (string), graduationYear (number),',
  'currentGPA (number), gpaType ("weighted"|"unweighted"), careerGoal (string), intendedMajors (string[]),',
  'location (string), highSchool (string), interests (string[]), budgetTotal (number, USD).',
].join(' ');

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

export function makeBedrockOnboardingChatter(options: AiOptions = {}): OnboardingChatter {
  return async (messages) => {
    const { text } = await converseWithSearch(renderTranscript(messages), {
      system: SYSTEM,
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
