// Nav + slot registration for the AI Assistant. The shell globs
// frontend/src/modules/*/nav.manifest.ts; importing this file registers the `ai-panel` slot whose
// body is the chat (opened by the shell's floating chat button). There is no standalone nav entry —
// the assistant is reachable everywhere via that button — so `nav` is intentionally empty.

import { registerSlot, type NavEntry } from '../../shared/shell';

// The AI Assistant slide-over body comes from this module.
registerSlot('ai-panel', () => import('./AiPanel'));

export const nav: NavEntry[] = [];
