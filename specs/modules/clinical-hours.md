# Module Spec — Clinical Hours Log

## Module id
`clinical-hours`

## Purpose
Structured clinical-hours tracking in the format nursing programs want — separate from the general
Activity Journal. Summary dashboard with benchmarks, supervisor directory, PDF export.

## Depends on
All foundational specs. Reads `peer-benchmark` (target comparison), optionally links to
`activity-journal` entries. PDF export (server-side render).

## Owns (entities)
**Clinical Hours Log Entry** (`CLINICAL#<id>/DETAILS`: date, facility, department, supervisorName,
supervisorTitle, supervisorContact, hours (decimal), duties[], patientInteraction (bool),
reflection, `visibility` [family|private], linkedActivityId; GSI3 by facility).

## API endpoints
`GET /clinical` (filters facility/department/dateRange; **visibility-filtered**); `GET /clinical/:id`
(`assertCanRead`); `POST /clinical`; `PUT /clinical/:id`; `DELETE /clinical/:id`;
`GET /clinical/summary` (total hours, by facility, by department, patient-interaction hours,
visibility-filtered); `GET /clinical/supervisors` (directory with contact + total hours);
`POST /clinical/export` (PDF formatted for applications).

## Frontend
- Log form: date, facility (dropdown of prior + new), department, supervisor name/title/contact,
  hours, duties (multi-select + freeform), patient-interaction toggle, reflection, visibility.
- Summary dashboard: total hours (prominent), by-facility bar, by-department pie, monthly trend,
  patient-interaction vs observational, benchmark comparison ("CSULB avg 150; you have 87").
- Supervisor directory (auto from entries) with recommender flagging.
- Export → PDF. Empty state; mobile + desktop.

## AI behavior
None (benchmark comparison reads `peer-benchmark` data).

## Privacy
`visibility`-bearing. All list/detail/summary reads through the visibility middleware; parents
never see private clinical entries; keira sees all.

## File-ownership boundary
`backend/modules/clinical-hours/**`, `frontend/src/modules/clinical-hours/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] CRUD + summary + supervisor directory + PDF export implemented + tested.
- [ ] **Privacy test:** parent blocked from private clinical entries in list/detail/summary; keira allowed.
- [ ] Charts + benchmark comparison; empty state; mobile + desktop. CI green; reviewer approved.
