#!/usr/bin/env node
// CI guard for Bedrock cost metering. Every Bedrock call MUST go through one of exactly two metered
// seams, so that token usage is recorded against the calling family + a named feature:
//
//   backend/shared/metering/invoke-messages.ts  — invokeMessages()      (plain single/multi-turn)
//   backend/shared/ai/bedrock.ts                — converseWithSearch()  (web-grounded tool loop)
//
// This guard exists because Interview Prep quietly built its OWN InvokeModelCommand against a
// private BedrockRuntimeClient. Every mock-question and answer-feedback call it made was invisible
// to per-family metering — no usage row, no cost attribution, and that family's spend understated on
// the admin dashboard. Nothing caught it for weeks.
//
// NOTE what is and isn't a violation. Importing `BedrockRuntimeClient` is FINE and common: modules
// construct a client lazily and INJECT it into invokeMessages (see goal-tracker/bedrock.ts). The
// bypass signal is constructing the COMMAND yourself — that's the call the seam would otherwise
// have made, and metered.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'backend';

// The only files allowed to build a raw Bedrock command. Both record usage before returning.
const ALLOW = new Set([
  'backend/shared/metering/invoke-messages.ts',
  'backend/shared/ai/bedrock.ts',
]);

// Constructing any of these outside ALLOW means the call never reaches recordUsage().
const NEEDLES = [
  'new InvokeModelCommand(',
  'new InvokeModelWithResponseStreamCommand(',
  'new ConverseCommand(',
  'new ConverseStreamCommand(',
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') out.push(...walk(p));
    } else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) {
      out.push(p);
    }
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  if (ALLOW.has(file)) continue;
  const src = readFileSync(file, 'utf8');
  for (const needle of NEEDLES) {
    if (src.includes(needle)) {
      violations.push(
        `${file}: builds \`${needle}\` directly — Bedrock calls must go through invokeMessages() or converseWithSearch() so usage is metered against the family.`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('check:metering ✗ — unmetered Bedrock call sites:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('check:metering ✓ — every Bedrock call goes through a metered seam.');
