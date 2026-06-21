# Module Spec — Certifications Tracker

## Module id
`certifications`

## Purpose
Track healthcare certifications with expiration dates, renewal requirements, and training progress.
AI suggests relevant certs for an aspiring ICU nurse.

## Depends on
All foundational specs. Bedrock (suggestions). Reads `student-profile` (career goal).

## Owns (entities)
**Certification** (`CERT#<id>/DETAILS`: name, issuingOrganization, certificationNumber, dateEarned,
expirationDate, renewalRequired, renewalFrequency, renewalRequirements, status [planned|in-progress|
active|expiring-soon|expired|renewed], trainingProgram, trainingHours, cost, documentUrl, notes).

## API endpoints
`GET /certifications` (filter status); `GET /certifications/:id`; `POST /certifications`;
`PUT /certifications/:id`; `DELETE /certifications/:id`; `POST /certifications/suggest` (AI suggests
relevant certs from career goal); `GET /certifications/expiring` (expiring within N days).
`POST /certifications/guidance` (ASYNC — creates a `cert-guidance` job to research "how & where to
get this cert near me", enqueued to the 300s SQS worker since the web-grounded research blows the 30s
API ceiling; returns 202 + the job); `GET /certifications/guidance/:jobId` (poll the job →
pending/complete/failed; result carries officialUrl, howToGet, prerequisites, typicalCost,
renewalFrequency, and location-aware localProviders[]).

## Frontend
- Certification cards with status badge (planned gray / in-progress blue / active green /
  expiring-soon yellow / expired red) and expiration countdown. Cards are EXPANDABLE in place
  (click the header) — full details + inline edit form + "how & where to get it" guidance; no modal.
  No status filter (the list self-sorts: expiring/active first).
- AI-suggested certs on first visit — all optional, user adds. Each suggestion (and each expanded
  tracked cert) offers "How & where to get it": on demand, a web-grounded lookup of the official
  source, the path to obtain it, and specific providers near the student (from `student-profile`
  location). Degrades to general guidance (no local list) when web search is unavailable.
- Training progress (hours done vs required, schedule, progress bar, cost) for in-progress certs.
- Expiration alerts widget (expiring within 90 days) — clicking an item expands that card. Empty
  state; mobile + desktop.

## AI behavior
`/certifications/suggest` → Bedrock (general knowledge, sync) → relevant certs for the career goal.
`/certifications/guidance` → web-grounded Bedrock (`converseWithSearch`) on the SQS worker → official
source + how-to + nearby providers for one cert, localized by the student's profile location.

## Privacy
Family-visible.

## File-ownership boundary
`backend/modules/certifications/**`, `frontend/src/modules/certifications/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] CRUD + status lifecycle + expiration computation + suggestions + training progress + tested.
- [ ] Cards with countdown; expiring widget; renew flow; empty state; mobile + desktop.
- [ ] CI green; reviewer approved.
