// Word-target parsing for essays. Colleges state their own counts inside prompt text
// ("in 500 words or fewer", "250-650 words", "a 300-word response") — when a new essay's
// prompt declares one, it becomes the essay's default target instead of the Common App 650.

/** The Common App personal-statement cap — the default coaching target when a prompt is silent. */
export const DEFAULT_TARGET_WORDS = 650;

/**
 * Extract a stated word count from prompt text, or undefined when the prompt is silent.
 * Ranges ("250-650 words") yield the upper bound; multiple mentions yield the largest.
 * Counts outside 50..5000 are ignored as noise ("list 3 words that describe you").
 */
export function parseTargetWords(prompt?: string): number | undefined {
  if (!prompt) return undefined;
  const matches = prompt.matchAll(/(\d{2,4})(?:\s*(?:-|–|—|to)\s*(\d{2,4}))?[-\s]*words?\b/gi);
  let best: number | undefined;
  for (const m of matches) {
    const upper = Number(m[2] ?? m[1]);
    if (Number.isFinite(upper) && upper >= 50 && upper <= 5000) {
      best = Math.max(best ?? 0, upper);
    }
  }
  return best;
}
