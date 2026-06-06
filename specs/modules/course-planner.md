# Module Spec — Course Planner

## Module id
`course-planner`

## Purpose
Map Keira's 4-year academic trajectory and track how courses satisfy college prerequisites.
Includes GPA calculation (weighted + unweighted, with what-if) and a prerequisite matrix.

## Depends on
All foundational specs. Reads `college-hub` (prerequisites per college).

## Owns (entities)
**Course** (`COURSE#<id>/DETAILS`): name, type (regular/honors/AP/dual-enrollment), subject, year,
semester, grade, gradePoints (weighted), units, `satisfiesPrereq[]` ({collegeId, prereqName}),
notes.

## API endpoints
`GET /courses` (filter year/subject); `POST /courses`; `PUT /courses/:id` (e.g. add final grade);
`DELETE /courses/:id`; `GET /courses/gpa` (weighted + unweighted); `GET /courses/prerequisites/:collegeId`
(satisfaction check for one college).

## Frontend
- **4-year grid**: rows courses, columns Freshman→Senior (Fall/Spring sub-cols); each cell shows
  name, type, grade; color coding (required-for-nursing red, recommended yellow, elective gray).
- **GPA calculator**: weighted + unweighted; **what-if** mode (add hypothetical future
  courses/grades to project GPA).
- **Prerequisite mapper**: matrix courses × target colleges with checkmarks; highlights gaps
  ("UCI requires Microbiology — not in your plan").
- Course entry form; empty state; mobile + desktop.

## AI behavior
None (GPA + prereq matching are computed).

## Privacy
Family-visible.

## File-ownership boundary
`backend/modules/course-planner/**`, `frontend/src/modules/course-planner/**`, the two manifests, this spec.

## Acceptance criteria
- [ ] CRUD + GPA (weighted/unweighted) + what-if + prereq matrix implemented + tested.
- [ ] Grid view with color coding; gap highlighting; empty state; mobile + desktop.
- [ ] CI green; reviewer approved.
