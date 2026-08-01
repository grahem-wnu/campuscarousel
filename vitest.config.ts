import { defineConfig } from 'vitest/config';

// Single test runner for the whole monorepo. Workers colocate tests next to source
// as `*.test.ts` (or `*.spec.ts`) under their own module paths; Vitest discovers them.
//
// Default environment is `node` (backend handlers, logic, the data layer). Frontend
// tests that need a DOM should opt in per-file with `// @vitest-environment jsdom`
// (the design-system workspace adds the jsdom dependency when the shell lands).
export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/cdk.out/**',
      '.worktrees/**',
      // Per-agent working copies of the whole repo (same category as .worktrees). Untracked, so CI
      // never sees them, but locally they re-run every suite N times against stale code — which
      // makes a local failure impossible to attribute.
      'agents/**',
    ],
    passWithNoTests: true,
    // Default env stays `node` (backend). DOM tests opt in per-file with `// @vitest-environment jsdom`.
    // The setup file only registers jest-dom matchers + RTL cleanup, which is inert for node tests.
    setupFiles: ['frontend/src/test/setup.ts'],
  },
});
