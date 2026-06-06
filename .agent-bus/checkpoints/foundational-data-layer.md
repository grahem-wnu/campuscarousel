# foundational-data-layer — checkpoint

## spec-reviewer @ 2026-06-06T04:25:00Z — PR #3 @ d1efaeb
**VERDICT: changes-requested** (not ready — empty WIP claim, no implementation)

## spec-reviewer @ 2026-06-06T04:50:00Z — PR #3 @ rebuilt HEAD (re-review)
**VERDICT: changes-requested** — ONE trivial blocker; everything else is approval-ready.

Worker-1 pushed the full lib (2534 lines, lib + tests + fixtures). Strong work. CI green,
CodeRabbit pass. **Supervisor: do NOT merge yet** — one fix outstanding:

BLOCKER (1): backend/shared/data/memory-client.ts:8 contains a literal NUL byte (U+0000) as the
in-memory composite-key separator (`${pk}<NUL>${sk}`). This makes git treat the file as BINARY
(Bin 0 -> 2974 bytes) -> no line-level diffs, ever, on a FROZEN contract all 17 modules depend on.
Fix: write the separator as an escape sequence or printable char so the source stays ASCII text;
verify `file -` reports "ASCII text" and the PR shows a textual diff. Runtime-identical.

Everything else PASSES (no other changes required):
- Completeness: all 18 entities wired in index.ts with correct prefixes + GSI projections
  (GSI1 by-date, GSI2 activities-by-category, GSI3 clinical-by-facility, GSI4 TEAS); fixtures+tests.
- Lib rules (data-layer.md:37-44): randomUUID ids; ISO-8601 UTC createdAt/updatedAt; createdAt
  preserved on update; userEdited[] + mergePreservingUserEdits never clobber human-edited fields.
- Visibility correctly NOT in the lib (data-layer.md:39-42); returns raw items.
- Single-table only; DynamoTableClient paginates correctly (LastEvaluatedKey + limit).
- No hardcoded config/secrets: tableClientFromEnv reads TABLE_NAME, throws if unset.
- Data model: Activity/Clinical/WhyNursing carry visibility; College/Scholarship/Benchmark Hydratable.

Minor (non-blocking): confirm the ~676-line package-lock.json growth is only @aws-sdk additions.
Re-review immediately on next push; expect to approve.
