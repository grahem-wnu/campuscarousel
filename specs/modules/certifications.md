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

## Frontend
- Certification cards with status badge (planned gray / in-progress blue / active green /
  expiring-soon yellow / expired red) and expiration countdown; one-click renew flow (links to
  renewal requirements).
- AI-suggested certs on first visit (CNA, BLS/CPR, First Aid, Stop the Bleed) — all optional, user adds.
- Training progress (hours done vs required, schedule, progress bar, cost) for in-progress certs.
- Expiration alerts widget (expiring within 90 days). Empty state; mobile + desktop.

## AI behavior
`/certifications/suggest` → Bedrock (general knowledge) → relevant certs for the career goal.

## Privacy
Family-visible.

## File-ownership boundary
`backend/modules/certifications/**`, `frontend/src/modules/certifications/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] CRUD + status lifecycle + expiration computation + suggestions + training progress + tested.
- [ ] Cards with countdown; expiring widget; renew flow; empty state; mobile + desktop.
- [ ] CI green; reviewer approved.
