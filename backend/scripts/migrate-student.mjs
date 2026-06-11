#!/usr/bin/env node
// One-time migration: re-key an existing single-CHILD tenant into the per-child layout (multi-student
// platform). Runs AFTER the tenancy migration, so items are already at `T#<tenant>#…`. It inserts the
// student tier so each per-child item becomes `T#<tenant>#S#<studentId>#…`, leaving FAMILY-LEVEL items
// (the student roster `STUDENT#…`, user profiles `USER#…`, and `REMINDER_SETTINGS`) at `T#<tenant>#…`.
//
// Phased + dry-runnable like the tenancy migration:
//   (pre)    ensure a first Student roster record exists for the tenant (idempotent — reused if present)
//   Phase A  write all new (student-prefixed) per-child items
//   Phase D  delete the old (tenant-only) per-child items — operator-gated, after verifying counts
// The pure `restudentkey` transform is unit-tested (migrate-student.test.ts). AWS wiring runs ONLY on an
// explicit operator invocation — STAGING first, then prod on Grahem's go with a PITR checkpoint first.
//
// Usage:
//   node backend/scripts/migrate-student.mjs --tenant <id> --table <name> [--student-name "Keira"] \
//        [--student-id <id>] [--dry-run] [--phase A|D]

const GSI_PK_ATTRS = ['GSI1PK', 'GSI2PK', 'GSI3PK', 'GSI4PK'];

/** A stored PK is family-level (NOT per-child) when the part after `T#<tenant>#` is one of these. */
export function isFamilyLevelRest(rest) {
  return (
    typeof rest === 'string' &&
    (rest.startsWith('STUDENT#') || rest.startsWith('USER#') || rest === 'REMINDER_SETTINGS')
  );
}

/** Strip the `T#<tenant>#` prefix from a key, or null if it isn't prefixed for this tenant. */
function restOf(key, tenantId) {
  const prefix = `T#${tenantId}#`;
  if (typeof key !== 'string' || !key.startsWith(prefix)) return null;
  return key.slice(prefix.length);
}

/**
 * Transform one tenant-scoped item into its per-child form. Returns null to SKIP:
 *  - keys not under this tenant (`T#<tenant>#…`) — other tenants / global registries,
 *  - family-level keys (roster / profiles / reminder settings),
 *  - keys already carrying the student tier (`…#S#…`) so the migration is idempotent.
 */
export function restudentkey(item, tenantId, studentId) {
  const rest = restOf(item?.PK, tenantId);
  if (rest === null) return null;
  if (rest.startsWith('S#')) return null; // already migrated — idempotent
  if (isFamilyLevelRest(rest)) return null; // family-level — stays at T#<tenant>#
  const inject = (key) => {
    const r = restOf(key, tenantId);
    if (r === null || r.startsWith('S#')) return key;
    return `T#${tenantId}#S#${studentId}#${r}`;
  };
  const out = { ...item, PK: inject(item.PK) };
  for (const attr of GSI_PK_ATTRS) {
    if (out[attr] !== undefined && out[attr] !== null) out[attr] = inject(out[attr]);
  }
  return out;
}

// --- AWS runner (only executed when invoked directly) -------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def;
  };
  const tenantId = opt('tenant');
  const table = opt('table');
  const dryRun = Boolean(opt('dry-run', false));
  const studentName = typeof opt('student-name') === 'string' ? opt('student-name') : 'Keira';
  let studentId = typeof opt('student-id') === 'string' ? opt('student-id') : undefined;
  if (!tenantId || !table) {
    console.error('Required: --tenant <id> --table <name>  [--student-name "Keira"] [--student-id <id>] [--dry-run] [--phase A|D]');
    process.exit(2);
  }

  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, GetCommand } = await import(
    '@aws-sdk/lib-dynamodb'
  );
  const { randomUUID } = await import('node:crypto');
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  // (pre) Resolve the first Student: reuse an existing roster record for this tenant, else create one.
  let scanned = 0;
  let existingStudentId;
  let cursor;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: cursor }));
    for (const item of page.Items ?? []) {
      const rest = restOf(item.PK, tenantId);
      if (rest && rest.startsWith('STUDENT#') && item.SK === 'DETAILS' && item.studentId) {
        existingStudentId = item.studentId;
      }
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  if (existingStudentId) {
    studentId = existingStudentId;
    console.log(`(pre) Reusing existing student ${studentId} for tenant ${tenantId}.`);
  } else {
    studentId = studentId ?? randomUUID();
    const now = new Date().toISOString();
    const record = {
      PK: `T#${tenantId}#STUDENT#${studentId}`,
      SK: 'DETAILS',
      GSI1PK: `T#${tenantId}#STUDENTS`,
      GSI1SK: `${now}#${studentId}`,
      studentId,
      name: studentName,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    console.log(`(pre) Creating first student "${studentName}" (${studentId}) for tenant ${tenantId}.`);
    if (!dryRun) await ddb.send(new PutCommand({ TableName: table, Item: record }));
  }

  // Phase A: scan + write student-prefixed copies of every per-child item.
  let migrated = 0;
  let skipped = 0;
  scanned = 0;
  cursor = undefined;
  const toDelete = [];
  do {
    const page = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: cursor }));
    for (const item of page.Items ?? []) {
      scanned += 1;
      const next = restudentkey(item, tenantId, studentId);
      if (!next) {
        skipped += 1;
        continue;
      }
      if (!dryRun) await ddb.send(new PutCommand({ TableName: table, Item: next }));
      toDelete.push({ PK: item.PK, SK: item.SK });
      migrated += 1;
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  console.log(`Phase A: scanned=${scanned} migrated=${migrated} skipped=${skipped} dryRun=${dryRun}`);
  console.log('');
  console.log(`>>> DEFAULT_STUDENT_ID for tenant ${tenantId} = ${studentId}`);
  console.log('    Set this on the routing Lambda so header-less requests resolve to this child.');
  console.log('');
  console.log('Phase D (delete old tenant-only per-child items) is operator-gated — run after verifying.');
  if (dryRun) console.log('DRY RUN — no writes performed.');
  if (!dryRun && opt('phase') === 'D') {
    for (const key of toDelete) await ddb.send(new DeleteCommand({ TableName: table, Key: key }));
    console.log(`Phase D: deleted ${toDelete.length} original (tenant-only) items.`);
  }
}

// Only run AWS work when executed directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('migrate-student failed:', err);
    process.exit(1);
  });
}
