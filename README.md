# Campus Carousel

**The college application journey, organized — for the whole family.**

Campus Carousel is a web app that turns the chaotic, multi-year run-up to college
applications into one calm, organized place. Instead of a shoebox of logins, spreadsheets,
sticky notes, and half-remembered deadlines, a family gets a single home for everything that
matters on the road to admission — and an AI coach that actually knows the student.

It's built for families with a high-schooler (or several) working toward college. Parents and
students share the same workspace, each with their own login, so everyone stays on the same page
without anyone having to nag.

---

## Why families use it

Applying to college is a three-year project that most families run out of their heads. Campus
Carousel gives that project a memory. Every activity, award, grade, essay draft, campus visit, and
deadline lives in one place and compounds over time — so when application season arrives, the whole
story is already written down.

**What you get:**

- **One source of truth.** Activities, achievements, courses, test scores, colleges, scholarships,
  deadlines, and documents — all in a single organized workspace instead of scattered across apps.
- **An AI coach that knows your student.** Ask questions and get answers grounded in *your*
  student's real record — not generic advice off the internet. It helps discover colleges, spot
  gaps, and draft essays rooted in things the student actually did.
- **College discovery, done for you.** Add a college and the app researches it — enriching it with
  current, real-world details and sorting your list into reach / target / safety.
- **An essay coach, not an essay writer.** Structured help that pushes the student's own voice
  forward. It coaches; it never writes the essay for them.
- **A shared family view — with the student in control.** Parents and students each get their own
  login. The student can keep certain reflections private, always. It's the student's app, not a
  surveillance tool.
- **Nothing falls through the cracks.** A running timeline and reminders keep deadlines, visits, and
  next steps in view.

## Features

- **Dashboard & Focus** — a personalized home that surfaces what matters right now
- **Activity & Experience Journal** — log activities, achievements, and reflections over time
- **AI Assistant** — ask anything; answers are grounded in the student's own data
- **College Hub** — discover, research, and organize colleges into reach / target / safety
- **Essay & Application Center** — coached essay drafting and an application tracker
- **Course Planner** — track course history and plan future coursework
- **Exam & Certification Prep** — standardized tests and certifications
- **Scholarships & Financial Aid** — track opportunities, deadlines, and aid
- **Campus Visit Planner** — plan and remember campus visits
- **Demonstrated-Interest Tracker** — log the touchpoints colleges care about
- **Goals & Master Timeline** — set goals and see the whole journey on one timeline
- **Peer Benchmark** — see how the profile stacks up against comparable applicants
- **Interview Prep** — practice and prepare
- **Conversational Onboarding** — a guided chat sets up the profile, goals, and college list
- **Multi-student & co-parent support** — track several kids; invite a second parent
- **Reminders & Documents** — deadlines in view, files in one place

---

# Technical overview

> The rest of this document is for developers. Campus Carousel began as a private family app
> ("Keira's Journey") and grew into a multi-tenant SaaS; you'll see both names in the history.

## Stack at a glance

- **Language:** TypeScript, end to end — frontend, backend, and infrastructure.
- **Frontend:** React + Vite + Tailwind CSS. No component library (kept intentionally light).
  Single-page app served from S3 behind CloudFront. Auth via `@aws-amplify/auth`.
- **Backend:** AWS Lambda (Node.js 20) behind an API Gateway **HTTP API**. A Cognito JWT
  authorizer validates every request — there is no hand-rolled auth code.
- **AI:** All model calls are server-side (Lambda → Amazon Bedrock, Claude Sonnet), with a web
  search tool enabled for college discovery and research.
- **Data:** A single **DynamoDB** table (on-demand) with a composite key and GSIs — one table for
  the whole app.
- **Async work:** SQS queues fan long-running jobs (college hydration, focus overviews, asset
  generation) out to worker Lambdas, so the API can respond immediately and the UI polls for status.
- **Infrastructure:** AWS **CDK** (TypeScript) defines everything. CI/CD runs through GitHub
  Actions; a push to `dev` auto-deploys to staging.

## Repository structure

This is an npm-workspaces monorepo:

```
.
├── frontend/     React + Vite + Tailwind SPA
├── backend/      Lambda handlers, organized as feature modules
│   ├── modules/  one folder per feature (college-hub, ai-assistant, application-central, …)
│   ├── lambda/   Lambda entry points
│   └── shared/   cross-cutting helpers (auth, DynamoDB access, etc.)
├── infra/        AWS CDK app — one stack per concern (see below)
├── spec/         the product specification (source of truth for behavior)
├── scripts/      repo checks (route + tenant-isolation guards)
└── docs/         additional developer docs
```

Backend logic is split into small, single-responsibility **feature modules** under
`backend/modules/` (activity journal, AI assistant, college hub, essays, scholarships, onboarding,
and more) rather than one monolith.

## AWS infrastructure

Everything is infrastructure-as-code in `infra/lib/`, one stack per concern:

| Stack | Responsibility |
| --- | --- |
| `auth-stack` | Cognito user pool + app client (username login, roles, tenant/student attributes) |
| `data-stack` | The single DynamoDB table + GSIs |
| `api-stack` | HTTP API + Lambda functions + JWT authorizer |
| `async-stack` | SQS queues + worker Lambdas (hydration / focus / assets lanes) + DLQs |
| `assets-stack` | College asset generation/storage |
| `web-stack` | S3 + CloudFront hosting for the frontend |
| `dns-stack` | Route 53 records for the custom domain |
| `cicd-stack` | GitHub Actions deployment pipeline |
| `observability-stack` | Alarms and alerting |

**Data model:** one DynamoDB table, multi-tenant. Rows are keyed by tenant (and student, for
per-child data), so families are isolated from one another at the key level. Visibility is enforced
server-side from the caller's JWT identity — the client is never trusted to filter, and a student's
private entries are never exposed to a parent.

## Working with the code

Prerequisites: **Node.js 20+** and npm. AWS deploys require credentials for the target account and
the AWS CDK toolkit.

```bash
# install all workspaces
npm install

# quality gates (run from the repo root)
npm run typecheck      # type-check every workspace
npm run lint           # ESLint across the repo
npm test               # vitest
npm run check:routes       # verify frontend routes are wired
npm run check:isolation    # verify tenant-isolation invariants

# build everything
npm run build
```

Run the frontend on its own:

```bash
cd frontend
npm run dev            # Vite dev server
```

Deploy the infrastructure (from `infra/`, with valid AWS credentials for the target account):

```bash
cd infra
npx cdk diff           # preview changes
npx cdk deploy --all   # deploy the stacks
```

### Contributing

- Branch off `dev`; open pull requests **against `dev`**. A merge to `dev` auto-deploys to staging.
- Keep changes typechecked, linted, and tested before opening a PR.
- **Behavior changes start in the spec** (`spec/keirasjourney-spec.md`), then the code — if the code
  and the spec disagree, the spec wins.
- Match the patterns already in the repo: TypeScript throughout, small focused modules, no hardcoded
  config or secrets, and dependencies added only when they clearly earn their place.

## License

[MIT](./LICENSE) — free to clone, modify, and use for any purpose. No attribution required.
