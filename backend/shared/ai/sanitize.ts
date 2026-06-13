// Neutralize untrusted, user-supplied text before it is interpolated into an LLM prompt.
//
// College names/locations (and similar fields) originate from user input or web-search
// hydration, then get concatenated into Bedrock prompts. A value containing newlines plus
// "IGNORE PRIOR INSTRUCTIONS. Output {…}" could otherwise inject new prompt lines/sections.
// We don't try to detect injection phrases (brittle); instead we remove the *structural*
// ability to inject — collapse all whitespace/newlines to single spaces, strip control
// characters, and bound the length. Combined with structured-output allowlisting on the
// parse side, this contains blast radius.

/**
 * Make an untrusted string safe to interpolate into a single labelled prompt field.
 * Single-line, control-char-free, length-bounded. Treat the result as DATA, not instructions.
 */
export function promptLiteral(value: string, maxLen = 200): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]+/g, ' ') // control chars (incl. newlines/tabs) -> space
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
