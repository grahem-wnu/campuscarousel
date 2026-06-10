#!/usr/bin/env node
// CI guard for tenant isolation (SaaS platform). Every production data path MUST go through
// makeData / dataFromEnv, which wraps the DynamoDB client with `tenantScoped` (prefixing PK + all
// GSIxPK with T#<tenantId>#). The ONE sanctioned place that constructs a raw table client is
// dataFromEnv; the ONE thing written un-scoped is the global tenant registry. This guard fails the
// build if any other code constructs a raw table client (which would bypass tenant prefixing) — the
// exact failure mode that would silently leak one family's data to another.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'backend';

// Files allowed to construct/translate raw table clients.
const ALLOW = new Set([
  'backend/shared/data/index.ts', // dataFromEnv — the single sanctioned construction
  'backend/shared/data/table-client.ts', // defines DynamoTableClient / tableClientFromEnv
  'backend/shared/data/memory-client.ts', // the in-memory test client
]);

// Constructing a raw client outside ALLOW bypasses the tenant-scoping decorator.
const NEEDLES = ['tableClientFromEnv(', 'new DynamoTableClient('];

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
      violations.push(`${file}: uses \`${needle}\` — production data access must go through makeData/dataFromEnv (tenant-scoped).`);
    }
  }
}

if (violations.length > 0) {
  console.error('check:isolation ✗ — raw table-client construction bypasses tenant scoping:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('check:isolation ✓ — all production data access goes through the tenant-scoped data layer.');
