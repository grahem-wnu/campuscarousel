// Onboarding registers the shell "onboarding" slot (a first-run overlay), not a nav page. The shell
// globs nav.manifest.ts eagerly at startup, so this registerSlot side-effect runs on load.

import { registerSlot, type NavEntry } from '../../shared/shell';

registerSlot('onboarding', () => import('./OnboardingGate'));

export const nav: NavEntry[] = [];
