# Keira's Journey — Product Specification

## Overview

Keira's Journey is a family-operated web application that tracks a high school student's complete journey toward college admission into a BSN (Bachelor of Science in Nursing) program. It accumulates structured data over 3+ years — activities, achievements, reflections, goals, course history, and college research — and uses AI (AWS Bedrock / Claude) to surface insights, answer questions, discover colleges, and assist with application essays grounded in real experiences.

**Users:** Three family members — Grahem (parent/admin), Kate (parent), Keira (student). All are active daily/weekly users.

**Hosting:** AWS — S3/CloudFront (frontend), API Gateway + Lambda (backend), DynamoDB (data), Cognito (auth), Bedrock (AI).

**Domain:** keirasjourney.com (or alternate if unavailable)

**Design:** Mobile-responsive web app. No native app. Clean, modern UI. Keira should feel ownership — this is her app, not a parental surveillance tool.

---

## Architecture

### Frontend
- React SPA (Vite or Next.js static export)
- Hosted on S3 + CloudFront
- Mobile-responsive (Tailwind CSS)
- No component library dependency — keep it lightweight

### Backend
- API Gateway (REST or HTTP API)
- Lambda functions (Node.js or Python — builder's choice)
- IAM-authenticated Bedrock calls (Claude Sonnet via `us.anthropic.claude-sonnet-4-20250514-v1:0` or latest available)

### Database
- DynamoDB — single-table design preferred for simplicity at this scale
- On-demand capacity (3 users, cost is negligible)

### Auth
- Cognito User Pool — 3 accounts (grahem, kate, keira)
- Username/password auth (plain usernames, no email required)
- JWT tokens for API Gateway authorization
- Role field in user profile: "admin" (Grahem), "parent" (Kate), "student" (Keira)

### Auth Flow — How Cognito Works

Cognito is AWS's managed auth service. You never build login infrastructure — Cognito handles password hashing, token generation, and session management. Here's the practical flow:

**Initial Setup (done once by Claude Code during deployment):**
1. Claude Code creates a Cognito User Pool configured with username sign-in (not email)
   - Set `username_attributes` to NONE (username-based, not email-based)
   - Set `auto_verified_attributes` to empty (no email/phone verification needed)
   - Make email NOT required in the schema
2. Creates an App Client within the pool (gives you a Client ID)
3. Pre-creates the 3 user accounts via AWS CLI

**How passwords work:**
- Passwords are stored by Cognito — never in DynamoDB, never in your code, never visible to you
- Cognito enforces password policy (min 8 chars, uppercase, lowercase, number, special char — configurable)
- You set temporary passwords when pre-creating accounts, and Cognito forces a password change on first login
- Since there's no email on the accounts, password reset is handled by Grahem (admin) — he can set a new temporary password via AWS CLI or console if someone forgets theirs

**User login flow:**
1. User enters username (e.g., "keira") + password on the login page
2. Frontend calls Cognito's `InitiateAuth` API (via AWS Amplify JS library or the Cognito SDK)
3. Cognito validates credentials and returns 3 tokens:
   - **ID Token** (JWT) — contains user identity (username, role). This is what your API uses.
   - **Access Token** — used for Cognito-specific operations (change password, etc.)
   - **Refresh Token** — long-lived token that silently refreshes the other two when they expire (ID/Access tokens expire after 1 hour by default)
4. Frontend stores tokens in memory (not localStorage for security) and includes the ID Token in the `Authorization` header on every API call
5. API Gateway validates the JWT automatically via a Cognito JWT Authorizer — no custom auth code needed

**Practical implementation:**
- Use the `@aws-amplify/auth` npm package in the React frontend — it handles the entire login/logout/refresh flow with ~10 lines of code
- Or use `amazon-cognito-identity-js` for a lighter-weight option
- The login page is a simple username + password form. Clean, minimal, branded with "Keira's Journey" logo.

**Pre-creating the 3 accounts (during deployment):**
```bash
# Create users with temporary passwords — no email needed
aws cognito-idp admin-create-user \
  --user-pool-id <POOL_ID> \
  --username grahem \
  --temporary-password "TempPass123!" \
  --user-attributes Name=custom:role,Value=admin \
  --message-action SUPPRESS

aws cognito-idp admin-create-user \
  --user-pool-id <POOL_ID> \
  --username kate \
  --temporary-password "TempPass123!" \
  --user-attributes Name=custom:role,Value=parent \
  --message-action SUPPRESS

aws cognito-idp admin-create-user \
  --user-pool-id <POOL_ID> \
  --username keira \
  --temporary-password "TempPass123!" \
  --user-attributes Name=custom:role,Value=student \
  --message-action SUPPRESS
```
`--message-action SUPPRESS` prevents Cognito from trying to send a welcome email (since there are no emails on the accounts). Grahem tells Kate and Keira the temporary password verbally. On first login, Cognito forces each user to set their own permanent password.

**Password reset without email:** Since no email is configured, Cognito's self-service "Forgot password" flow won't work. Instead:
- Grahem resets passwords via CLI: `aws cognito-idp admin-set-user-password --user-pool-id <POOL_ID> --username keira --password "NewTempPass123!" --permanent`
- Or the app can include a "Reset Password" button visible only to the admin role that calls `adminSetUserPassword` via a Lambda endpoint
- The login page should NOT show a "Forgot password?" link — instead show "Ask Dad" or just omit it

**No signup page needed:** This is a private family app with exactly 3 users. Accounts are created during deployment. If you ever want to add a user (counselor, tutor), use the AWS CLI or add an admin function in the app.

### AI
- AWS Bedrock — Claude Sonnet model
- All AI calls are server-side (Lambda → Bedrock)
- Bedrock web search tool enabled for college research and current data lookups
- Conversation history stored in DynamoDB for context continuity

---

## Privacy Model

All data is visible to all three users EXCEPT:

- **Keira's private reflections:** Journal entries can be marked "private" by Keira. Private entries are:
  - Hidden from Grahem and Kate's views
  - Visible ONLY to Keira
  - Accessible to the AI assistant in ALL modes (including essay partner mode) — this is the whole point
  - The AI should never surface private reflection content in responses visible to other users (enforce via user context in API calls)

- **Implementation:** Each journal entry has a `visibility` field: `"family"` (default) or `"private"`. API Gateway authorizer checks requesting user role against visibility. AI assistant receives all entries regardless of visibility when Keira is the authenticated user.

---

## Data Model (DynamoDB)

### Single-Table Design

**Partition Key (PK):** Entity type + ID  
**Sort Key (SK):** Sub-entity or metadata

### Entities

#### User
```
PK: USER#<userId>
SK: PROFILE
Attributes:
  - name: string
  - email: string
  - role: "admin" | "parent" | "student"
  - createdAt: ISO timestamp
  - preferences: map (theme, notification settings, etc.)
```

#### College
```
PK: COLLEGE#<collegeId>
SK: DETAILS
Attributes:
  - name: string
  - location: string (city, state)
  - state: string (2-letter code, e.g., "CA", "MI" — for filtering)
  - programType: "direct-admit-BSN" | "pre-nursing-secondary-app" | "ABSN-only" | "RN-to-BSN-only"
  - isDirectAdmit: boolean
  - hasBSN: boolean
  - hasAcceleratedBSN: boolean
  - isTopPick: boolean (default false — user-toggled flag for prioritized schools)
  - ranking: string (e.g., "US News #8 BSN 2026")
  - overview: string (AI-generated narrative, 2-3 paragraphs — what makes this school and its
    nursing program distinctive: reputation, teaching hospital/clinical network, culture,
    outcomes, and who it's a good fit for. This is the lead content of the Overview tab.)
  - admissionsDeepDive: string (AI-generated narrative, 1-2 paragraphs — exactly how a student
    gets in: every pathway (direct-admit vs. secondary application), what each requires, the real
    timeline, selectivity, and the most important things an applicant must nail.)
  - nclexPassRate: string (e.g., "94% first-time (2024)")
  - employmentRate: string (e.g., "98% employed within 6 months")
  - tuitionInState: number (annual)
  - tuitionOutOfState: number (annual)
  - costOfAttendanceOutOfState: number (annual full cost of attendance — tuition + fees + housing
    + food + books; the sticker price before aid)
  - estimatedNetPriceAfterAid: number (annual cost AFTER grants & scholarships — this is the real
    out-of-pocket figure and is DISTINCT from tuition; never copy tuition into this field)
  - percentReceivingAid: string (e.g., "62% receive grants/scholarships")
  - avgAidAmount: number (annual average grant/scholarship per student)
  - applicationFee: number (e.g., 60)
  - estimatedTotalCost: number (4-year with room/board)
  - estimatedCostAfterAid: number (estimated 4-year cost with merit aid)
  - acceptanceRateNursing: string (e.g., "~10%" or "70 of 700 applicants")
  - acceptanceRateUniversity: string
  - avgGPAAdmitted: string
  - prerequisites: list of strings
  - applicationDeadlines: map { earlyAction: date, regularDecision: date, nursingApp: date }
  - essayPrompts: list of strings
  - requiredTests: list of strings (e.g., "TEAS", "SAT", "Casper SJT")
  - clinicalPartners: list of strings (hospitals/health systems)
  - testimonials: list of maps { quote: string, attribution: string (e.g., "BSN student"),
    source: string (URL) } — authentic student voices pulled from Niche/Cappex/Reddit/the school
  - campusImageUrls: list of strings (URLs to campus/program photos for the branded header gallery)
  - specialNotes: string (e.g., "Attached to UPMC — excellent ICU rotations")
  - website: string
  - dataSources: list of strings (URLs the AI relied on during the most recent hydration — shown
    as "Sources" so the family can verify and dig deeper)
  - dataAsOf: string (academic year the hydrated figures reflect, e.g., "2025-2026")
  - branding: map
    - logoUrl: string (URL to college logo — AI fetches from school website or public source during hydration)
    - primaryColor: string (hex — school's primary brand color, e.g., "#002855" for Michigan)
    - secondaryColor: string (hex — school's secondary brand color)
    - mascot: string (e.g., "Wolverines", "Bruins", "Anteaters")
  - contactInfo: map
    - nursingAdmissionsPhone: string
    - nursingAdmissionsEmail: string
    - nursingAdmissionsUrl: string
    - financialAidPhone: string
    - financialAidUrl: string
    - campusVisitUrl: string
  - status: "researching" | "considering" | "target" | "applying" | "applied" | "accepted" | "rejected" | "enrolled" | "removed"
  - fitScore: number (calculated based on Keira's profile vs. requirements)
  - addedBy: "ai-discovered" | "manual"
  - hydrationStatus: "pending" | "in-progress" | "complete" | "partial" | "failed"
  - lastDataRefresh: ISO timestamp
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### Discovery Job
Transient record backing async college discovery (web-grounded discovery exceeds the 30s API budget,
so the API creates a job and the SQS worker fills it; the frontend polls).
```
PK: DISCOVERY#<jobId>
SK: DETAILS
Attributes:
  - status: "pending" | "complete" | "failed"
  - filters: map (the discovery input echoed back: query, state, programType, maxTuition, directAdmitOnly, limit)
  - candidates: list of maps (discovered colleges: name, location, state, programType, isDirectAdmit, hasBSN, ranking, tuition, website, summary)
  - count: number (candidates found)
  - error: string (set when status = "failed")
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### College Note
```
PK: COLLEGE#<collegeId>
SK: NOTE#<timestamp>
Attributes:
  - author: string (userId)
  - content: string
  - noteType: "general" | "visit" | "research" | "contact" | "financial-aid" | "application-update"
  - createdAt: ISO timestamp
```

#### College Progress Checklist
```
PK: COLLEGE#<collegeId>
SK: CHECKLIST
Attributes:
  - items: list of maps
    - id: string
    - label: string (e.g., "Submit transcripts", "Complete TEAS", "Write personal statement")
    - completed: boolean
    - completedDate: ISO timestamp
    - completedBy: string (userId)
    - dueDate: ISO timestamp (optional)
```

#### Activity / Journal Entry
```
PK: ACTIVITY#<activityId>
SK: DETAILS
Attributes:
  - userId: string (who logged it)
  - date: ISO date
  - category: "volunteer" | "clinical" | "academic" | "athletic" | "leadership" | "personal" | "work" | "award" | "other"
  - subcategory: string (e.g., "soccer", "girl-scouts", "homeless-outreach", "hospital-volunteer", "CNA-training")
  - title: string (short description)
  - description: string (longer narrative, optional)
  - hours: number (optional)
  - reflection: string (optional — weekly reflection prompt response)
  - visibility: "family" | "private"
  - tags: list of strings (freeform, for AI context)
  - linkedColleges: list of collegeIds (which colleges this activity is relevant to)
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp

GSI1 (for querying by date):
  GSI1PK: ACTIVITIES
  GSI1SK: <date>#<activityId>

GSI2 (for querying by category):
  GSI2PK: CATEGORY#<category>
  GSI2SK: <date>#<activityId>
```

#### Goal
```
PK: GOAL#<goalId>
SK: DETAILS
Attributes:
  - title: string
  - description: string
  - category: "academic" | "clinical" | "extracurricular" | "test-prep" | "application" | "personal"
  - targetDate: ISO date
  - period: "freshman" | "sophomore" | "junior" | "senior" | "summer-2027" | etc.
  - status: "not-started" | "in-progress" | "completed" | "deferred" | "dropped"
  - progress: number (0-100, can be manually set or auto-calculated)
  - milestones: list of maps
    - id: string
    - label: string
    - completed: boolean
    - completedDate: ISO timestamp
  - linkedActivities: list of activityIds
  - createdBy: string (userId)
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### Course
```
PK: COURSE#<courseId>
SK: DETAILS
Attributes:
  - name: string
  - type: "regular" | "honors" | "AP" | "dual-enrollment"
  - subject: "math" | "science" | "english" | "social-studies" | "world-language" | "elective" | "health-sciences"
  - year: "freshman" | "sophomore" | "junior" | "senior"
  - semester: "fall" | "spring" | "full-year" | "summer"
  - grade: string (e.g., "A", "A+", "B+")
  - gradePoints: number (weighted)
  - units: number
  - satisfiesPrereq: list of maps { collegeId, prereqName }
  - notes: string
  - createdAt: ISO timestamp
```

#### Essay
```
PK: ESSAY#<essayId>
SK: DETAILS
Attributes:
  - collegeId: string
  - prompt: string
  - promptSource: string (e.g., "Common App Personal Statement", "UCI Insight Question #2")
  - drafts: list of maps
    - version: number
    - content: string
    - createdAt: ISO timestamp
    - wordCount: number
  - status: "brainstorming" | "drafting" | "reviewing" | "final"
  - aiSuggestedActivities: list of activityIds (activities the AI surfaced as relevant)
  - aiSuggestedAngles: list of strings (narrative thread suggestions)
  - notes: string
  - createdBy: string (userId)
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### AI Conversation
```
PK: CONVERSATION#<conversationId>
SK: MESSAGE#<timestamp>
Attributes:
  - role: "user" | "assistant"
  - userId: string (who initiated)
  - content: string
  - context: string (which module/page the question was asked from)
  - toolsUsed: list of strings (e.g., "web_search", "college_lookup")
  - createdAt: ISO timestamp
```

#### Budget
```
PK: BUDGET
SK: DETAILS
Attributes:
  - totalBudget: number (200000)
  - currency: "USD"
  - notes: string
  - updatedBy: string (userId)
  - updatedAt: ISO timestamp
```

#### Scholarship
```
PK: SCHOLARSHIP#<scholarshipId>
SK: DETAILS
Attributes:
  - name: string
  - provider: string (organization, foundation, school, etc.)
  - amount: number (dollar value, or 0 if variable/unknown)
  - amountDescription: string (e.g., "$5,000", "Full tuition", "Varies")
  - type: "merit" | "need-based" | "nursing-specific" | "community-service" | "diversity" | "state-specific" | "organization" | "other"
  - eligibility: list of strings (e.g., "California resident", "3.5+ GPA", "Girl Scout Gold Award", "First-generation college student")
  - applicationDeadline: ISO date
  - applicationUrl: string
  - requiredMaterials: list of strings (e.g., "500-word essay", "2 recommendation letters", "Community service log")
  - linkedColleges: list of collegeIds (if school-specific, otherwise empty)
  - isRenewable: boolean
  - renewalRequirements: string
  - status: "discovered" | "researching" | "preparing" | "applied" | "awarded" | "denied" | "expired"
  - awardedAmount: number (actual amount if awarded)
  - notes: string
  - addedBy: "ai-discovered" | "manual"
  - lastDataRefresh: ISO timestamp
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### Clinical Hours Log Entry
```
PK: CLINICAL#<entryId>
SK: DETAILS
Attributes:
  - date: ISO date
  - facility: string (e.g., "CHOC Children's Hospital", "Mission Hospital Mission Viejo")
  - department: string (e.g., "Pediatric ICU", "Emergency Department", "General Med-Surg")
  - supervisorName: string
  - supervisorTitle: string (e.g., "RN", "Charge Nurse", "Volunteer Coordinator")
  - supervisorContact: string (email or phone — for verification)
  - hours: number
  - duties: list of strings (e.g., "Patient comfort rounding", "Vital signs observation", "Supply restocking")
  - patientInteraction: boolean (did she interact directly with patients?)
  - reflection: string (optional — what did she observe/learn?)
  - visibility: "family" | "private"
  - linkedActivityId: string (optional — links to the corresponding Activity Journal entry for unified tracking)
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp

GSI (for querying by facility):
  GSI3PK: FACILITY#<facilityName>
  GSI3SK: <date>#<entryId>
```

#### Certification
```
PK: CERT#<certId>
SK: DETAILS
Attributes:
  - name: string (e.g., "Certified Nursing Assistant (CNA)", "BLS/CPR", "First Aid", "ACLS")
  - issuingOrganization: string (e.g., "American Heart Association", "American Red Cross", "California CDPH")
  - certificationNumber: string (optional)
  - dateEarned: ISO date
  - expirationDate: ISO date (null if no expiration)
  - renewalRequired: boolean
  - renewalFrequency: string (e.g., "Every 2 years")
  - renewalRequirements: string (e.g., "Skills check + written test")
  - status: "planned" | "in-progress" | "active" | "expiring-soon" | "expired" | "renewed"
  - trainingProgram: string (e.g., "Saddleback College CNA Program")
  - trainingHours: number
  - cost: number
  - documentUrl: string (optional — link to uploaded certificate image/PDF)
  - notes: string
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### TEAS Prep Record
```
PK: TEAS#<recordId>
SK: DETAILS
Attributes:
  - type: "practice-test" | "study-session" | "official-exam"
  - date: ISO date
  - overallScore: number (composite percentage)
  - sectionScores: map
    - reading: number
    - math: number
    - science: number
    - englishLanguageUsage: number
  - source: string (e.g., "ATI Practice Test A", "Mometrix Practice Exam", "Official TEAS 7")
  - studyTopics: list of strings (topics covered in study session)
  - studyDuration: number (minutes)
  - weakAreas: list of strings (self-identified or AI-identified weak topics)
  - strongAreas: list of strings
  - notes: string
  - createdAt: ISO timestamp

GSI (for querying by date for progress tracking):
  GSI4PK: TEAS_SCORES
  GSI4SK: <date>#<recordId>
```

#### Interview Prep Session
```
PK: INTERVIEW#<sessionId>
SK: DETAILS
Attributes:
  - type: "mock-practice" | "real-interview"
  - collegeId: string (optional — which school this is for)
  - date: ISO date
  - questions: list of maps
    - question: string
    - answer: string (Keira's response)
    - aiFeedback: string (AI's coaching notes)
    - rating: number (1-5, AI or self-assessed)
    - linkedActivities: list of activityIds (experiences referenced in the answer)
  - overallNotes: string
  - confidenceLevel: number (1-10, self-assessed)
  - createdAt: ISO timestamp
```

#### Why Nursing Entry
```
PK: WHYNURSING#<entryId>
SK: DETAILS
Attributes:
  - date: ISO date
  - title: string (short — e.g., "The conversation with Marcus at the soup kitchen")
  - content: string (longer narrative — what happened, what she felt, what it means)
  - category: "moment" | "realization" | "conversation" | "observation" | "experience" | "inspiration"
  - linkedActivityId: string (optional — connects to a journal entry)
  - linkedClinicalId: string (optional — connects to a clinical hours entry)
  - tags: list of strings
  - visibility: "family" | "private"
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### Demonstrated Interest / Touchpoint
```
PK: COLLEGE#<collegeId>
SK: TOUCHPOINT#<timestamp>
Attributes:
  - type: "info-session" | "campus-visit" | "email-exchange" | "phone-call" | "webinar" | "college-fair" | "interview" | "social-media" | "other"
  - date: ISO date
  - description: string (e.g., "Attended virtual BSN info session — learned about direct-admit process")
  - contactPerson: string (optional — e.g., "Sarah Chen, Nursing Admissions Counselor")
  - contactEmail: string (optional)
  - contactPhone: string (optional)
  - followUpNeeded: boolean
  - followUpDate: ISO date (optional)
  - followUpCompleted: boolean
  - notes: string
  - createdBy: string (userId)
  - createdAt: ISO timestamp
```

#### Contact (Network)
```
PK: CONTACT#<contactId>
SK: DETAILS
Attributes:
  - name: string
  - role: string (e.g., "ICU Nurse", "Volunteer Coordinator", "Admissions Counselor", "AP Bio Teacher")
  - organization: string (e.g., "CHOC Children's Hospital", "University of Iowa Nursing", "Aliso Niguel HS")
  - relationship: "mentor" | "supervisor" | "teacher" | "admissions" | "nurse" | "recommender" | "other"
  - phone: string (optional)
  - email: string (optional)
  - linkedCollegeId: string (optional — if affiliated with a target school)
  - howMet: string (e.g., "Hospital volunteer program", "College info session", "Girl Scout event")
  - dateMet: ISO date
  - lastContactDate: ISO date
  - notes: string
  - isPotentialRecommender: boolean
  - recommenderSlot: string (optional — "STEM-teacher" | "humanities-teacher" | "clinical-supervisor" | "community-leader" | "other")
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### Campus Visit
```
PK: COLLEGE#<collegeId>
SK: VISIT#<visitId>
Attributes:
  - date: ISO date
  - visitType: "campus-tour" | "nursing-dept-visit" | "open-house" | "admitted-student-day" | "overnight" | "virtual"
  - attendees: list of strings (e.g., ["keira", "grahem"])
  - questionsToAsk: list of maps
    - question: string
    - answer: string (filled in during/after visit)
    - askedTo: string (who answered — e.g., "Dr. Williams, BSN Program Director")
  - impressions: string (overall notes after the visit)
  - pros: list of strings
  - cons: list of strings
  - photos: list of strings (URLs — optional, if they want to upload photos)
  - wouldAttend: "yes" | "no" | "maybe" | "undecided"
  - travelCost: number (optional — for budgeting visit trips)
  - createdBy: string (userId)
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

#### Peer Benchmark (per college)
> **Metrics are MAJOR-AWARE in the UI.** The stored fields keep their (nursing-legacy) names, but
> their meaning is generic — `avgTEASScore` = typical entrance-exam score, `typicalClinicalHours` =
> typical hands-on experience hours. The fit/benchmark card + Peer Benchmark page label them from the
> active major's pack: the entrance-exam row shows the major's exam name (nursing → "TEAS") and is
> **hidden entirely for majors with no standardized entrance exam** (e.g. Construction Management);
> the experience-hours row is labeled per major ("Clinical hours" / "Internship / jobsite hours" /
> default "Experience hours"). The researcher likewise omits the entrance-exam figure when the major
> has none.
```
PK: COLLEGE#<collegeId>
SK: BENCHMARK
Attributes:
  - avgGPAAdmitted: number
  - avgTEASScore: number
  - avgSATScore: number (optional)
  - typicalClinicalHours: number
  - typicalVolunteerHours: number
  - typicalCertifications: list of strings (e.g., ["CNA", "BLS"])
  - typicalExtracurriculars: string (narrative — "Most admitted students have 2+ years of hospital volunteering...")
  - competitiveEdges: list of strings (what makes applicants stand out at this school)
  - keirasComparison: map (auto-calculated)
    - gpaStatus: "above" | "at" | "below"
    - teasStatus: "above" | "at" | "below" | "not-taken"
    - clinicalHoursStatus: "above" | "at" | "below"
    - volunteerHoursStatus: "above" | "at" | "below"
    - overallReadiness: "strong" | "competitive" | "needs-work" | "insufficient-data"
  - lastDataRefresh: ISO timestamp
  - updatedAt: ISO timestamp
```

---

## Modules

### 1. Dashboard

**Purpose:** At-a-glance view of the entire journey. Different emphasis per user role.

**All users see:**
- Current GPA (calculated from Course data)
- Activity summary (total hours by category, streak indicator)
- Clinical hours total (from Clinical Log — large, prominent number)
- Upcoming deadlines (from colleges, goals, scholarships, certifications, timeline)
- Recent activity feed (last 10 journal entries, family-visible only unless Keira is viewing)
- College list summary (count by status: researching, target, applying, etc.)
- TEAS prep status (latest practice score, or "not started")
- Certifications status (active count, any expiring soon)
- Quick-add button for activities

**Grahem/Kate additionally see:**
- Budget overview (total budget + awarded scholarships = adjusted budget vs. estimated costs for target schools)
- Goal progress dashboard (how many goals on-track vs. behind)
- Scholarship pipeline (total tracked value, total applied, total awarded)
- Benchmark readiness summary (how many target schools Keira is "competitive" at)

**Keira additionally sees:**
- Personal streak tracker (days since last journal entry)
- Next milestone due
- Motivational stat (e.g., "You've logged 127 volunteer hours — that's more than most UCLA applicants")
- "Why Nursing" prompt: "Anything meaningful happen this week? Capture it."
- Interview readiness score (from mock interview history)

### 2. Activity Journal

**Purpose:** The core data accumulation engine. Every meaningful thing Keira does gets logged here.

**Views:**
- **Timeline view** (default): Chronological feed of entries, filterable by category, date range
- **Calendar view**: Monthly calendar with activity dots
- **Summary view**: Aggregate stats — total hours by category, charts over time

**Entry form (must be fast — under 30 seconds):**
- Date (default: today)
- Category (dropdown: volunteer, clinical, academic, athletic, leadership, personal, work, award)
- Subcategory (contextual dropdown or freeform)
- Title (short — e.g., "Fed homeless at Laguna Beach outreach")
- Hours (optional number input)
- Description (optional textarea — for longer entries)
- Visibility toggle: "Family" (default) | "Private" (Keira only)
- Tags (freeform chips)

**Weekly reflection prompt (optional, shown once per week):**
- System prompts Keira with a rotating question:
  - "What's one thing you learned this week that surprised you?"
  - "What was the hardest thing you did this week?"
  - "If you could tell your future self one thing about this week, what would it be?"
  - "What are you most proud of from this week?"
- Response stored as a journal entry with category "personal" and a `isReflection: true` flag
- These reflections are the primary raw material for essay writing later

**Family members can:**
- Grahem/Kate can add entries on Keira's behalf (e.g., logging a soccer tournament she forgot to enter)
- All entries show who created them

### 3. College Hub

**Purpose:** Research, track, compare, and manage target colleges. This is the most data-heavy module. The app starts empty — all college data is discovered and hydrated via real-time AI web searches.

**First-Run Experience (Empty State):**
When the College Hub has zero colleges, the user sees:
- A welcoming empty state: "Let's find the right nursing programs for Keira."
- A prominent "Discover BSN Programs" button
- Brief explanation: "We'll search hundreds of colleges across the country to find every BSN and nursing program, check whether they offer direct admission, and pull in tuition, rankings, and contact details — all in real time."
- Clicking the button triggers the Initial Discovery Flow (see below)

**Initial Discovery Flow:**
- Triggered by the "Discover BSN Programs" button (available anytime, not just first run)
- User can optionally narrow the search with filters: region/state, direct-admit only, cost ceiling, minimum ranking, public/private
- Or just click "Find All" to cast the widest net
- Backend: discovery is **async** (mirrors hydration), because web-grounded discovery routinely
  exceeds the API Gateway/Lambda 30s synchronous budget:
  - `POST /colleges/discover` validates the filters, creates a transient **DiscoveryJob**
    (`status: "pending"`, PK `DISCOVERY#<jobId>`), enqueues it on the shared SQS hydration queue
    (message routed by `jobId`), and returns `202` with the job id immediately.
  - The SQS worker (300s budget) runs the web-grounded discovery prompt: "Search the web and find
    accredited U.S. universities offering a BSN program; for each, determine name, city, state,
    whether it's direct-admit from high school or requires a secondary nursing application, the
    nursing program URL, and any ranking. Return structured JSON." It writes the candidates back
    onto the job (`status: "complete"`, or `"failed"` with an error).
  - The frontend polls `GET /colleges/discover/:jobId` until the job settles, then renders the
    candidates. (With no queue configured — tests/local — the job runs inline.)
- Results displayed as a scrollable list with checkboxes — user selects which colleges to add
- "Add All" and "Add Selected" buttons
- Each added college is saved to DynamoDB with `hydrationStatus: "pending"`

**College Hydration (AI-powered data enrichment):**
- When a college is added (via discovery OR manual add), a hydration job runs:
  - Lambda calls Bedrock **through the shared web-search tool path** (`converseWithSearch`, Tavily-backed) — NOT plain general-knowledge inference. Numbers like tuition, net price, average admitted GPA, acceptance rate, deadlines, and rankings change yearly and MUST be verified against current-year web sources, not recalled from training data.
  - The prompt instructs the model to run **multiple searches across different source types**, because no single site has everything:
    - The college's own nursing site (.edu) — program structure, prerequisites, deadlines, application steps, clinical partners
    - U.S. News / Niche — rankings and reputation
    - College Navigator / NCES, collegetuitioncompare, the school's financial-aid office — cost of attendance, **net price after aid**, % receiving aid
    - Common Data Set / admissions-stats sites — **average admitted GPA and acceptance rate**, which are rarely on the school's own marketing pages and must be searched for specifically
    - Niche / Cappex / Reddit — authentic student testimonials about the nursing program
  - The prompt requires genuine **narrative** output (not just fields): an `overview` (2-3 paragraphs on what makes the school/program distinctive and who it fits) and an `admissionsDeepDive` (how a student actually gets in — every pathway, timeline, selectivity, what to nail).
  - **Critical accuracy rules baked into the prompt:**
    - Separate NURSING-specific stats (BSN/direct-admit acceptance rate, nursing GPA) from UNIVERSITY-WIDE stats, and label which is which.
    - `estimatedNetPriceAfterAid` is the cost AFTER grants/scholarships and is DISTINCT from tuition — never copy tuition into it. If only tuition is found, leave net price null.
    - **Prefer partial data over blanks:** include any value found for even one of tuition/net price/GPA/acceptance rate. Only omit a field if genuinely unavailable after searching. NEVER fabricate a number — an omitted field is acceptable, a wrong one is not.
    - Cite every source URL in `dataSources`, and stamp `dataAsOf` with the academic year the figures reflect.
  - Results parsed and stored in DynamoDB
  - `hydrationStatus` updated to "complete" or "partial" (if some fields couldn't be found)
  - `lastDataRefresh` set to current timestamp
- Fields the AI couldn't find are left null and visually flagged in the UI as "Not found — edit manually or refresh"
- Hydration can be re-triggered per college ("Refresh Data" button) or in bulk ("Refresh All" button)
- Hydration is async — college appears in list immediately with a loading indicator, data populates as it arrives
- **Fallback:** if `AI_WEB_SEARCH` is disabled or the search tool is unavailable, hydration degrades to general-knowledge inference (today's behavior) and the college is marked `partial` rather than failing outright.

**Manual College Add:**
- Simple form: just the school name (required), optionally city/state/website
- On save, auto-triggers hydration — AI goes out and collects all available data
- User does NOT need to fill in any other fields manually unless they want to override AI-fetched data

**College List View:**
- Card or table view (user can toggle)
- Each college card/row shows:
  - College logo (from branding.logoUrl, with fallback to a generic graduation cap icon)
  - College name
  - Location (city, state)
  - Program type badge: "Direct Admit" (green) or "Secondary App" (yellow)
  - Top Pick star icon (toggle on/off with one click)
  - Status badge (color-coded)
  - Hydration status indicator (spinner if in-progress, warning icon if partial/failed)
- **Sorting:** Default by Top Pick first, then alphabetical. Also sortable by: name, state, ranking, estimated cost, status, application deadline
- **Filtering:**
  - Search box: filter by college name (instant, client-side)
  - State dropdown: filter by state (multi-select)
  - Program type: direct-admit / secondary app / all
  - Status: researching / target / applying / all
  - Top Picks Only: toggle to show only starred colleges
  - Cost range: slider or min/max input
- **Bulk actions:** Refresh All Data, Export List

**College Detail View:**
Each college has a full detail page with a branded header and tabs:

- **Header:** College logo (large), school name, mascot, location, and school colors used as accent/background stripe. A campus photo gallery (from `campusImageUrls`) banners the page. Contact info (nursing admissions phone/email, financial aid, campus visit link) displayed as quick-action buttons/links.

- **Overview tab (story-first):** Reads top-to-bottom like a viewbook so a first-time visitor can answer "should I even look into this school?" before scanning numbers.
  1. **Narrative** — the `overview` paragraphs lead the page, followed by the `admissionsDeepDive`.
  2. **Student voices** — `testimonials` rendered as quote cards with attribution.
  3. **Key stats** — the structured data grid (ranking, NCLEX pass rate, net price after aid, out-of-state tuition, full cost of attendance, % receiving aid, nursing vs. university acceptance rate, average admitted GPA, deadlines, required tests, prerequisites, clinical partners).
  4. **Sources** — `dataSources` listed as links, with the `dataAsOf` academic year, so the family can verify and dig deeper.
  - "Refresh Data" button — triggers AI to re-research this school via web search and update any changed information
  - "Last refreshed: [date]" timestamp shown prominently
  - Every field is manually editable — user edits override AI-fetched values
  - Fields the AI couldn't find are highlighted with "Data not found" placeholder and edit button; the narrative blocks are hidden (not shown empty) until hydrated.
  
- **Notes tab:** Chronological notes from any family member
  - Note types: general, visit notes, research finding, contact info, financial aid info, application update
  - Rich text or markdown support
  
- **Checklist tab:** Application preparation checklist
  - **AI-generated on demand** — a "Generate application steps" button builds a checklist tailored to
    *this* college and the student's intended major, grounded in the college's hydrated data
    (deadlines, application fee, prerequisites, required tests, essay prompts, application service).
    Model-only (no web search) so it stays within the request budget. New steps are merged
    (de-duplicated) into the existing list — it never clobbers manual or already-checked items.
  - Customizable — add/remove items manually; generated steps are editable like any other
  - Due dates (carried from known deadlines) and completion tracking
  - Visual progress bar

- **Prepare tab:** AI "how to prepare in high school" plan for getting into THIS college's program
  - On-demand AI (`POST /colleges/:id/prep`, model-only, persisted on the college) generates, tailored
    to the college + the student's intended major + grad year: **academic targets** (GPA / SAT / ACT,
    grounded in the college's hydrated admission bar), **recommended high-school classes** (e.g. AP
    Physics, AP Calculus, Anatomy & Physiology), and **activities/certifications** that strengthen the
    application. Regenerate after changing the major or refreshing the college.
  - The college's own program-level requirements (admission criteria + in-major *college* courses from
    `prerequisites`) are shown below for **reference** — explicitly NOT framed as high-school to-dos
    (a high schooler can't take "CON 223 Strength of Materials"; that confusion is what this replaced).
  - Distinct from the Course Planner's coverage matrix (which maps entered courses to college
    prerequisites for transfer/dual-enrollment planning).
  
- **Fit Analysis tab:** AI-generated analysis of how Keira's current profile matches this school
  - GPA comparison
  - Activity hours vs. what the school values
  - Prerequisites satisfied vs. needed
  - Budget analysis (estimated cost vs. family budget)
  - "Refresh Fit Analysis" button

- **Essays tab:** Essay prompts for this school + drafts (links to Application Central essay workspace)

**College Comparison View:**
- Select 2-4 colleges for side-by-side comparison
- Key fields: cost, ranking, acceptance rate, program type, clinical partners, application deadlines
- Budget impact comparison (remaining budget after each school)
- College logos displayed at top of each column

**College Removal:**
- Soft delete — moves to "Removed" status, not hard deleted
- Can be restored
- Removed colleges hidden from default list view but accessible via "Show Removed" filter

### 4. Goal Tracker

**Purpose:** Define, track, and achieve goals mapped to the 4-year plan.

**Pre-loaded goals (seeded on first deploy, editable):**

No pre-loaded goals. Instead, when the Goal Tracker is first accessed (or when the user clicks "Suggest Goals"), the AI generates recommended goals based on:
- The student's current grade level (derived from graduation year)
- Career goal (e.g., "Critical Care Nurse / ICU")
- Current activities already logged
- Target colleges already in the system

The AI uses Bedrock (no web search needed for this — general knowledge suffices) to generate year-by-year goal suggestions. Example output for a freshman nursing-track student:

Freshman Year:
- Maintain 4.0+ GPA
- Complete Girl Scouts Silver Award (or progress toward Gold)
- Log 50+ community service hours
- Research 10+ BSN programs
- Meet with school counselor about nursing track

Sophomore Year:
- Begin hospital volunteer program
- Take AP Biology
- Achieve 100+ cumulative community service hours
- Begin TEAS test prep research
- Attend 2+ college nursing info sessions
- Explore CNA certification programs

Junior Year:
- Complete CNA certification (summer)
- Take AP Chemistry
- Begin TEAS prep (study plan)
- Narrow college list to 8-12 schools
- Take SAT/ACT
- Begin application essay brainstorming
- Accumulate 200+ total clinical/volunteer hours

Senior Year:
- Submit all applications by deadlines
- Complete TEAS exam
- Write and finalize all essays
- Submit FAFSA and CSS Profile
- Apply for nursing-specific scholarships
- Make final college decision by May 1

All suggestions are presented as a checklist — user can accept, modify, or delete any suggested goal before saving. User can also add entirely custom goals at any time.

**Goal Detail View:**
- Progress bar (manual % or auto-calculated from linked activities)
- Linked activities (which journal entries contribute to this goal)
- Milestones with checkboxes
- Notes

**Goal Board View:**
- Kanban-style: Not Started | In Progress | Completed
- Or timeline view by school year

### 5. Course Planner

**Purpose:** Map Keira's 4-year academic trajectory and track how courses satisfy college prerequisites.

**4-Year Grid View:**
- Rows: courses
- Columns: Freshman, Sophomore, Junior, Senior (with Fall/Spring sub-columns)
- Each cell shows: course name, type (regular/honors/AP), grade (if completed)
- Color coding: required for nursing (red), recommended (yellow), elective (gray)

**GPA Calculator:**
- Weighted and unweighted GPA calculated from entered courses
- "What-if" mode: add hypothetical future courses and grades to project GPA

**Prerequisite Mapper:**
- For each target college, shows which prerequisites are satisfied by current/planned courses
- Coverage matrix: colleges (rows) × prerequisites (columns) with covered/gap markers and a met count
- **Tap a college row to expand it** — shows that college's full breakdown (courses still needed
  first, then covered), so the wide matrix is usable on mobile without reading across columns
- Highlights gaps: "UCI requires Microbiology — not currently in your plan"

**Course Entry:**
- Name, type, subject, year, semester, grade, units
- Link to prerequisite requirements at specific colleges

### 6. Application Central

**Purpose:** Senior year command center for managing applications across all target schools.

**Application Tracker:**
- Table view: one row per college
- Columns: school, deadline, status (not started / in progress / submitted / complete), essay status, recommendation status, transcript status, test scores sent, financial aid status
- Deadline countdown (days remaining, color-coded)

**Essay Workspace:**
This is the killer feature — the app's end goal is helping the student write authentic application
essays, and this is where it happens. The AI is a **coach, not a ghostwriter**: it suggests,
questions, and critiques; it never writes, rewrites, or supplies sentences/paragraphs for the essay.

For each essay:

- **College-linked prompts**: an essay can be linked to a college from the roster. Creating an essay
  offers that college's real, hydrated `essayPrompts` as one-tap starting points (promptSource:
  "college"), or a free-text prompt for Common App / practice work.
- **Prompt display** at top, with the linked college shown as a chip
- **AI Context Panel** (sidebar) — every AI action is grounded in a cross-section of the collected
  data (activities, clinical/experience hours, Why-Nursing motivations — including Keira's private
  entries when she is the authenticated caller) **and** in what the target college is looking for
  (overview, admissions deep-dive, essay prompts, benchmark competitive edges) when a college is linked:
  - "Find relevant experiences" button → AI surfaces the most relevant activities, reflections, and
    achievements, plus suggested narrative angles with brief explanations
  - "Practice questions" button → AI generates sample application/supplemental questions in the
    style of the target college (grounded in its real prompts + admissions data) for practice runs
- **Writing area**: editor for drafting
- **Version history**: Save drafts, compare versions
- **Word count**: With target range (e.g., Common App: 250-650 words)
- **AI Review with rating**: "Check my essay" → AI returns structured feedback (strengths,
  improvements, authenticity note — does NOT rewrite) **plus a rubric rating**: 1-10 scores for
  prompt fit, voice/authenticity, structure, specificity, and (when a college is linked) college
  alignment; an overall 1-10 score; and a readiness verdict (`ready` / `close` / `keep-working`).
  A compact `lastReview` summary (overall, verdict, when, which draft) is persisted on the essay so
  progress shows in the essay list; the full review is returned live and never persisted. Ratings
  come only from the real AI path — the deterministic fallback gives basic feedback without scores.

**Recommendation Tracker:**
- Who's been asked
- Status: asked / agreed / submitted
- Deadline
- Notes (e.g., "Asked Coach Martinez on 10/1, she agreed")

**Test Score Tracker:**
- SAT/ACT scores
- TEAS scores
- AP exam scores
- Which schools have received which scores

### 7. AI Assistant

**Purpose:** Contextual AI help available from anywhere in the app.

**Implementation:** Floating chat button (bottom-right) that opens a slide-over panel. Chat interface.

**Capabilities:**

**Ask Mode (default):**
- Natural language questions about anything
- Automatically includes relevant context from the current page (if on a college detail page, includes that college's data; if on essay workspace, includes the essay prompt and relevant activities)
- Can query the database: "How many volunteer hours do I have?" "What's my current GPA?" "Which schools haven't I submitted transcripts to?"
- Can search the web via Bedrock's web search tool: "What are Iowa's nursing program application deadlines for Fall 2028?" "Did CSULB change their TEAS requirement?"
- Answers include citations when web search is used

**College Discovery Mode:**
- Triggered by questions like "Find me BSN programs in the Southeast under $150K" or "What direct-admit nursing programs exist?"
- AI searches the web, returns structured results
- User can add results directly to their college list from the chat
- AI notes whether each program is direct-admit or requires a secondary application

**Essay Partner Mode:**
- Activated when user is on the essay workspace
- AI has access to ALL of Keira's journal entries, reflections, activities, goals, and course history (including private entries when Keira is authenticated)
- Does NOT write essays — provides:
  - Relevant experience suggestions with brief explanations of why they connect to the prompt
  - Narrative angle options (e.g., "You could frame your homeless outreach as a story about the moment you understood health equity")
  - Structural feedback on drafts
  - Authenticity check ("This paragraph sounds generic — can you add a specific detail from your experience?")

**Bedrock Integration Details:**
- Model: Claude Sonnet (via Bedrock `us.anthropic.claude-sonnet-4-20250514-v1:0` or latest)
- System prompt includes: user role, current page context, relevant database records
- Web search enabled via Bedrock's tool use
- Conversation history maintained per user per session (stored in DynamoDB)
- Max context: include the last 10 messages + relevant records from the module the user is currently viewing
- Cost management: Sonnet keeps costs low; at casual family usage expect $10-30/month across all AI features (chat, discovery, hydration, mock interviews, study plans, benchmark research, recommender briefs)

### 8. Scholarship Discovery + Tracker

**Purpose:** Find and track nursing-specific scholarships to stretch the $200K budget. Many scholarships have unique requirements that match Keira's profile (Girl Scouts, community service, California resident, aspiring nurse) — the app finds them automatically.

**Scholarship Discovery (AI-powered):**
- "Discover Scholarships" button triggers Bedrock + web search
- AI searches for: nursing-specific scholarships, healthcare scholarships, community service scholarships, Girl Scout scholarships, California student scholarships, scholarships at each target college
- Results returned as structured list with: name, amount, deadline, eligibility requirements
- User selects which to track
- Can re-run discovery periodically — new scholarships are posted throughout the year

**Scholarship List View:**
- Card/table view sortable by: deadline (soonest first), amount (highest first), status
- Filterable by: type, status, linked college, deadline range
- Color-coded deadlines (red = within 30 days, yellow = within 90 days)
- Total potential value displayed at top ("$47,500 in tracked scholarships")
- Total awarded displayed separately ("$12,000 awarded so far")

**Scholarship Detail View:**
- All structured data (amount, eligibility, deadline, required materials)
- Application checklist with completion tracking
- "Refresh Data" button to re-check current details via web search
- Notes
- Link to application URL
- Linked colleges (if school-specific)

**Budget Integration:**
- Dashboard shows: total budget + awarded scholarships = adjusted budget
- College cost estimates update when scholarships are awarded
- "What if" view: if Keira wins scholarships X, Y, Z — which schools become affordable?

### 9. TEAS Prep Center

**Purpose:** Track TEAS exam preparation with practice test scores, study plans, and topic-level performance analysis. The TEAS is the single biggest gate for BSN admissions.

**Score Tracker:**
- Log practice test scores (overall + per section: reading, math, science, English)
- Line chart showing score progression over time
- Section-by-section breakdown with color coding (green = strong, yellow = needs work, red = critical gap)
- Target score line per college (if available from college data)

**Study Plan:**
- AI generates a personalized study plan based on:
  - Practice test scores (focus on weak areas)
  - Target colleges and their TEAS requirements
  - Available time before exam date
  - Learning pace
- Plan shows: weekly topic focus, recommended study hours, practice test schedule
- Progress tracking against the plan

**Study Session Log:**
- Quick-log: date, topics studied, duration, notes
- Linked to weak areas from practice tests
- Cumulative study hours displayed

**AI Coaching:**
- "Analyze my scores" → AI reviews score history, identifies trends, flags plateaus
- "What should I study this week?" → AI recommends topics based on weakest areas and upcoming exam date
- "Am I ready?" → AI compares current scores against target school requirements

**Official Exam Tracking:**
- Log official TEAS score when taken
- Track which schools the score has been sent to
- If retaking: comparison with previous attempts

### 10. Clinical Hours Log (Experience Hours)

**Purpose:** Structured experience-hours tracking in the format programs want to see. Separate from the general Activity Journal — this is the formal, detailed record.

> **MAJOR-AWARE vocabulary.** Surfaced as "Experience Hours" and relabeled per the active major's pack
> (`experienceVocab`, on `GET /experience/summary`): the hours noun ("Clinical hours" / "Internship /
> jobsite hours" / "Experience hours"), the place field ("Facility" / "Site / company"), its
> placeholders, and a highlight flag that exists ONLY for majors that track it (nursing → "Patient
> care") — for other majors the highlight checkbox/badge/stat are hidden. Stored field names are
> unchanged; this is a labeling/visibility layer so the module doesn't read as nursing-only.

**Log Entry Form:**
- Date
- Facility name (dropdown of previously used + new entry)
- Department (dropdown of previously used + new entry)
- Supervisor name, title, contact info
- Hours (decimal — e.g., 4.5)
- Duties performed (multi-select from common list + freeform add)
- Direct patient interaction? (yes/no toggle)
- Reflection (optional — links to "Why Nursing" if applicable)
- Visibility: family/private

**Summary Dashboard:**
- Total clinical hours (large number, prominently displayed)
- Hours by facility (bar chart)
- Hours by department type (pie chart — ICU, ER, peds, med-surg, etc.)
- Monthly trend chart
- Hours with direct patient interaction vs. observational
- Comparison to target school benchmarks: "CSULB competitive applicants average 150 clinical hours. You have 87."

**Supervisor Directory:**
- Auto-populated from log entries
- Contact info for each supervisor
- Total hours under each supervisor
- Flag potential recommendation letter writers

**Export:**
- Generate PDF clinical hours log formatted for nursing applications
- Includes: date, facility, department, hours, supervisor name, duties
- Professional format suitable for submission with applications

### 11. Certifications Tracker

**Purpose:** Track healthcare certifications with expiration dates, renewal requirements, and training progress.

**Certification Cards:**
- Visual cards for each certification
- Status badge: planned (gray), in-progress (blue), active (green), expiring soon (yellow), expired (red)
- Countdown to expiration
- One-click "renew" flow (links to renewal requirements and next steps)

**Pre-suggested Certifications (AI-generated based on career goal):**
- On first visit, AI suggests relevant certifications for an aspiring ICU nurse:
  - CNA (Certified Nursing Assistant) — suggested summer after sophomore year
  - BLS/CPR (Basic Life Support) — American Heart Association
  - First Aid — American Red Cross
  - Stop the Bleed — optional but differentiating
- All suggestions are optional — user adds the ones they want to track

**Training Progress:**
- For certifications in progress (e.g., CNA program):
  - Track training hours completed vs. required
  - Class schedule
  - Progress bar
  - Cost tracking

**Expiration Alerts:**
- Dashboard widget showing certifications expiring within 90 days
- AI proactively mentions in chat: "Your BLS certification expires in 45 days — renewal requires a skills check at an AHA training center"

### 12. Interview Prep

**Purpose:** Practice for BSN program interviews using AI-powered mock interviews grounded in Keira's actual experiences.

**Mock Interview Mode:**
- Keira clicks "Start Mock Interview"
- Optionally selects a target school (AI tailors questions to that program's values)
- AI presents nursing-school interview questions one at a time:
  - "Why do you want to be a nurse?"
  - "Describe a time you showed compassion to someone in need."
  - "What would you do if you disagreed with a doctor's order?"
  - "Tell me about a challenge you overcame."
  - "Why did you choose [specific school]?"
  - "What experience has most prepared you for nursing school?"
  - "How do you handle stress?"
  - "Describe a time you worked as part of a team."
- Questions are drawn from a mix of: common BSN interview questions (AI's knowledge), school-specific questions (web search), and behavioral questions tailored to Keira's profile
- Keira types or voice-records her answer (voice → text transcription if feasible, otherwise typed)
- AI provides coaching feedback after each answer:
  - Strengths of the answer
  - What's missing (e.g., "You mentioned your volunteer work but didn't include a specific story — the soup kitchen conversation with Marcus from your Why Nursing journal would be powerful here")
  - Suggested improvements
  - Rating (1-5)
  - References to specific journal entries, clinical experiences, or Why Nursing moments she could weave in

**Interview History:**
- All mock sessions saved
- Progress tracking: average rating over time
- Weak areas (question types she struggles with)
- Strongest answers (can review and refine before real interviews)

**Real Interview Log:**
- Log actual interviews: date, school, interviewer name, questions asked, how she felt it went
- Post-interview notes
- Follow-up thank you note tracking

**Question Bank:**
- AI-generated + manually added
- Categorized: personal motivation, clinical experience, teamwork, ethics/scenarios, school-specific
- Starred "must-prepare" questions

### 13. "Why Nursing" Living Document

**Purpose:** A dedicated space to capture moments, realizations, and experiences that crystallize why Keira wants to be a critical care nurse. Not a journal, not an essay draft — a growing collection of meaning-making moments that become the raw material for the most authentic application essays any admissions committee has ever read.

**Entry Types:**
- **Moment:** A specific thing that happened (e.g., "Watched an ICU nurse calm a panicking family while simultaneously monitoring three patients")
- **Realization:** An insight or shift in thinking (e.g., "I realized critical care isn't about the technology — it's about being the last human connection someone might have")
- **Conversation:** A meaningful exchange with someone (e.g., "Marcus at the soup kitchen told me he hasn't seen a doctor in 6 years because he's afraid of hospitals")
- **Observation:** Something she noticed (e.g., "The CNA at Mission Hospital knew every patient's name and what made them smile")
- **Inspiration:** A person, book, documentary, experience that reinforced the path

**Entry Form:**
- Date
- Title (short, evocative)
- Full narrative (no length limit — write as much or as little as feels right)
- Category (moment/realization/conversation/observation/inspiration)
- Link to related journal entry or clinical log (optional)
- Tags
- Visibility: family/private

**Timeline View:**
- Chronological stream of entries
- Visual — each entry type has a distinct icon/color
- Shows the evolution of her "why" over months and years
- "3 years of entries" is itself a compelling story of commitment

**AI Integration:**
- The AI assistant and essay partner mode have full access to all Why Nursing entries
- When helping with essays, AI can say: "Your entry from March 2027 about the conversation with Marcus directly connects to Emory's essay prompt about health equity. Here's how you could structure that narrative."
- AI can also prompt: "It's been 3 weeks since your last Why Nursing entry. Anything from your clinical shifts recently that resonated?"

### 14. Demonstrated Interest + Contact Network

**Purpose:** Track every touchpoint with target schools (info sessions, emails, visits) and build a network of contacts (nurses, admissions counselors, mentors, supervisors) who become recommendation sources and application differentiators.

**Demonstrated Interest (per college):**
- Shown as a tab on each college's detail page
- Chronological log of every interaction with the school
- Entry types: info session, campus visit, email exchange, phone call, webinar, college fair, interview, social media interaction
- Each entry includes: date, description, contact person (if applicable), follow-up needed
- Visual indicator on college list: "5 touchpoints" badge
- AI insight: "You've had 5 interactions with Iowa's nursing program. That's strong demonstrated interest — mention this in your application."

**Contact Network (standalone section):**
- Rolodex-style view of all contacts Keira has built
- Filterable by: relationship type, organization, linked college
- Each contact shows: name, role, organization, how they met, last contact date, notes
- "Potential Recommender" flag with recommender slot assignment

**Recommendation Strategy Board (integrated into Application Central):**
- Visual board showing 4 recommender slots:
  - STEM Teacher (AP Bio, AP Chem)
  - Humanities Teacher (English, History)
  - Clinical/Volunteer Supervisor (hospital coordinator, CNA instructor)
  - Community Leader (Girl Scout leader, homeless outreach coordinator)
- Each slot shows: assigned contact (or "unassigned"), relationship strength, date relationship started
- Timeline: when to start cultivating each relationship, when to ask
- AI generates a one-page "recommender brief" per contact — a summary of Keira's activities, goals, and achievements that she can give to each recommender so they write a stronger letter
- Tracking: asked → agreed → received letter → submitted to which schools

**Network Insights (AI-powered):**
- "You have 3 potential recommenders in the clinical supervisor slot but none in humanities. Consider building a stronger relationship with your English teacher this semester."
- "Your Girl Scout leader has known you for 4 years — she'd be a strong community leader recommender."

### 15. Campus Visit Planner

**Purpose:** Plan, execute, and document campus visits with nursing-specific preparation. Schools notice when students visit and ask informed questions.

**Visit Planning:**
- Select a college → "Plan Visit" button
- AI generates:
  - Best time to visit (during academic year vs. summer, open house dates if available via web search)
  - Nursing-specific questions to ask (pre-populated checklist):
    - "What hospitals/health systems do BSN students rotate through?"
    - "What's the ICU clinical placement rate for BSN students?"
    - "What's your NCLEX first-time pass rate?"
    - "How many clinical hours are included in the program?"
    - "Is there a direct-admit guarantee or is nursing a secondary application?"
    - "What support services exist for nursing students?"
    - "What's the student-to-faculty ratio in clinical rotations?"
    - "Are there opportunities for undergraduate nursing research?"
  - Custom questions can be added
  - Logistics: address, parking, who to contact for a nursing department tour (pulled from college contact info)

**Visit Trip Planner (for out-of-state visits):**
- Group nearby schools into trip itineraries
- AI suggests: "Iowa and Michigan are both in the Midwest — visit both in one trip during spring break"
- Estimated travel cost per trip
- Map view of planned visits

**Post-Visit Documentation:**
- Guided debrief form:
  - Overall impressions
  - Pros and cons (structured list)
  - Answers to pre-planned questions
  - "Would attend?" rating
  - Photos
- Notes automatically linked to the college record
- Comparison view after multiple visits

**Visit Impact:**
- College detail page shows "Visited on [date]" badge
- Application essays can reference the visit authentically: AI knows she visited and what impressed her

### 16. Peer Benchmark Dashboard

**Purpose:** Show what a competitive admitted student looks like at each target school, and where Keira stands. Turns abstract goals into concrete, measurable gaps.

**Per-College Benchmark (tab on college detail page):**
- AI researches (via web search) the profile of competitive admitted nursing students at each school
- Displays a comparison card:
  - GPA: school average vs. Keira's (with status indicator)
  - TEAS Score: school average vs. Keira's (or "not taken yet")
  - Clinical Hours: typical competitive range vs. Keira's total from Clinical Log
  - Volunteer Hours: typical range vs. Keira's total from Activity Journal
  - Certifications: what competitive applicants typically have vs. what Keira has
  - Extracurriculars: narrative comparison
- Overall readiness badge: "Strong Match" / "Competitive" / "Needs Work" / "Insufficient Data"
- "Refresh Benchmark" button — AI re-researches current data

**Aggregate Benchmark View (standalone page):**
- Matrix view: all target colleges (columns) × key metrics (rows)
- Keira's current stats highlighted
- Color coding: green (exceeds), yellow (meets), red (below), gray (no data)
- Shows at a glance which schools she's strongest for and where gaps exist
- "Biggest gaps" callout: "Your clinical hours are below the competitive range at 6 of 10 target schools. 43 more hours would move you to 'competitive' at all of them."

**Progress Over Time:**
- Monthly snapshot of Keira's profile vs. aggregate benchmarks
- Are gaps closing? Are they widening?
- AI commentary: "Since September, you've closed the clinical hours gap at 3 schools. Iowa and Pitt are now in your competitive range."

### 17. Master Timeline

**Purpose:** A single unified calendar showing everything across all modules — deadlines, goals, activities, visits, test dates, application milestones — in one view.

**Calendar View:**
- Month, quarter, and year views
- Color-coded by source:
  - Blue: activities/journal entries
  - Green: goals/milestones
  - Red: application deadlines
  - Yellow: test dates (TEAS, SAT, AP exams)
  - Purple: campus visits
  - Orange: scholarship deadlines
  - Pink: certification expirations/renewals
- Click any item to jump to its detail page in the relevant module

**Timeline View:**
- Horizontal scrolling timeline from freshman year to senior year
- Shows the full journey arc
- Major milestones as prominent markers
- "You are here" indicator
- Can zoom in to month level or zoom out to full 4-year view

**Upcoming View:**
- Next 30/60/90 day view
- Prioritized list: overdue items first, then by date
- Grouped by: this week, next week, this month, later
- Quick-action buttons (mark complete, snooze, open detail)

**AI Integration:**
- "What should I focus on this month?" → AI reviews the timeline and prioritizes
- "Are there any conflicts?" → AI checks for overlapping deadlines, double-booked weekends
- "What am I forgetting?" → AI reviews the 4-year plan and flags items that should be on the timeline but aren't

---

## First-Run Experience

The app starts completely empty. No seed data, no pre-loaded colleges. All data is populated by users and AI in real-time.

### First Login Flow

When a user first logs in and the database is empty, the app walks through a brief setup:

1. **Student Profile Setup** — Prompted to enter basic info (or admin can pre-fill):
   - Student name, high school, graduation year
   - Current GPA and GPA type (weighted/unweighted)
   - Career goal (free text — e.g., "Critical Care Nurse / ICU")
   - Dream school (optional — free text)
   - Interests (freeform tags)
   - Current activities (quick-add list: name, type, organization)
   - Family college budget (total dollars available)

2. **College Discovery Prompt** — After profile setup, the app prompts:
   - "Ready to find nursing programs? Click 'Discover BSN Programs' to search colleges across the country."
   - Links directly to the College Hub discovery flow
   - User can skip and add colleges manually later

3. **Goal Setup Prompt** — After college discovery (or skip), the app prompts:
   - "Want to set up your year-by-year goals? We have suggested milestones for aspiring nursing students."
   - If accepted, AI generates suggested goals based on the student's current grade level and career goal
   - All suggestions are editable — user can accept, modify, or delete any goal
   - User can also skip and create goals manually

### No Seed Data Anywhere

- **Colleges:** All discovered via real-time AI web search. Zero pre-loaded records.
- **Goals:** Suggested by AI based on student profile, but only if user opts in. Not pre-loaded.
- **Activities:** Always user-entered. No dummy data.
- **Courses:** Always user-entered. No dummy data.

### Student Profile (Stored Record)

```
PK: STUDENT_PROFILE
SK: DETAILS
Attributes:
  - name: string
  - highSchool: string
  - district: string (optional)
  - location: string (city, state)
  - graduationYear: number (e.g., 2029)
  - currentGradeLevel: string (calculated from graduationYear)
  - currentGPA: number
  - gpaType: "weighted" | "unweighted"
  - careerGoal: string
  - dreamSchool: string (optional)
  - interests: list of strings
  - currentActivities: list of maps { name, type, organization }
  - budget: map { total: number, currency: "USD", notes: string }
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp
```

---

## API Endpoints

### Auth
- `POST /auth/login` — Cognito login (username + password → returns JWT tokens)
- `POST /auth/refresh` — Refresh JWT using refresh token
- `POST /auth/change-password` — Change password (required on first login with temporary password, available anytime after)
- `POST /auth/admin-reset-password` — Admin-only: reset another user's password (Grahem only, for when Kate or Keira forget theirs)
- No signup endpoint, no forgot-password endpoint — accounts are pre-created, password resets go through Grahem

### Colleges
- `GET /colleges` — List all tracked colleges (query params: status, programType, state, isTopPick, search, sortBy, sortOrder)
- `GET /colleges/:id` — Get college details (includes branding, contact info, hydration status)
- `POST /colleges` — Add college manually (minimum: name; auto-triggers hydration)
- `PUT /colleges/:id` — Update college details (manual edits override AI-fetched values)
- `DELETE /colleges/:id` — Soft delete (set status to "removed")
- `PATCH /colleges/:id/top-pick` — Toggle isTopPick flag
- `POST /colleges/:id/hydrate` — Trigger AI hydration for a single college (re-researches via web search)
- `POST /colleges/hydrate-all` — Trigger AI hydration for all colleges with stale data (> N days since lastDataRefresh)
- `POST /colleges/discover` — AI-powered BSN program discovery (accepts optional filters: region, state, directAdmitOnly, maxCost, publicOnly). Returns list of discovered programs. Does NOT auto-add — returns results for user selection.
- `POST /colleges/bulk-add` — Add multiple colleges from discovery results (accepts list of college objects, triggers hydration for each)
- `GET /colleges/:id/notes` — Get notes for a college
- `POST /colleges/:id/notes` — Add note
- `PUT /colleges/:id/checklist` — Update checklist items

### Activities
- `GET /activities` — List activities (filters: category, dateRange, visibility based on auth)
- `GET /activities/:id` — Get activity detail
- `POST /activities` — Create activity
- `PUT /activities/:id` — Update activity
- `DELETE /activities/:id` — Delete activity
- `GET /activities/summary` — Aggregate stats (hours by category, counts by month)

### Goals
- `GET /goals` — List goals (filter by period, status, category)
- `GET /goals/:id` — Get goal detail
- `POST /goals` — Create goal
- `PUT /goals/:id` — Update goal (including milestones, progress)
- `DELETE /goals/:id` — Delete goal
- `POST /goals/suggest` — AI generates suggested goals based on student profile, grade level, career goal, and current activities. Returns suggestions (not auto-saved — user accepts/modifies/rejects)

### Courses
- `GET /courses` — List all courses (filter by year, subject)
- `POST /courses` — Add course
- `PUT /courses/:id` — Update course (e.g., add final grade)
- `DELETE /courses/:id` — Delete course
- `GET /courses/gpa` — Calculate current GPA (weighted + unweighted)
- `GET /courses/prerequisites/:collegeId` — Check prerequisite satisfaction for a specific college

### Essays
- `GET /essays` — List all essays (filter by collegeId, status)
- `GET /essays/:id` — Get essay with all drafts
- `POST /essays` — Create essay
- `PUT /essays/:id` — Update essay (add draft, change status)
- `DELETE /essays/:id` — Delete essay
- `POST /essays/:id/find-experiences` — AI finds relevant journal entries for this essay prompt
  (grounded in the linked college's admissions data when the essay has a collegeId)
- `POST /essays/:id/review` — AI reviews a draft: feedback + 1-10 rubric ratings (prompt fit, voice,
  structure, specificity, college alignment), overall score, readiness verdict. Persists a compact
  `lastReview` summary on the essay; full review returned live only. Never rewrites.
- `POST /essays/:id/practice-questions` — AI generates sample application questions in the target
  college's style (from its real essayPrompts + admissions deep-dive) for practice

### AI Assistant
- `POST /ai/chat` — Send message to AI assistant
  - Body: `{ message, context: { module, collegeId?, essayId?, ... }, conversationId? }`
  - Returns: `{ response, conversationId, toolsUsed? }`
- `GET /ai/conversations` — List recent conversations
- `GET /ai/conversations/:id` — Get full conversation history

### Dashboard
- `GET /dashboard` — Aggregated dashboard data for authenticated user
  - Returns: GPA, activity summary, clinical hours total, TEAS latest score, certification status (active/expiring), upcoming deadlines (colleges + goals + scholarships + certifications), college status counts, goal progress, budget overview with scholarship impact, benchmark readiness summary, recent activity feed

### Student Profile
- `GET /profile` — Get student profile
- `PUT /profile` — Update student profile (any user can edit)

### Budget
- `GET /budget` — Get budget details
- `PUT /budget` — Update budget

### Scholarships
- `GET /scholarships` — List all tracked scholarships (filters: type, status, linkedCollege, deadline range)
- `GET /scholarships/:id` — Get scholarship details
- `POST /scholarships` — Add scholarship manually (auto-triggers AI hydration)
- `PUT /scholarships/:id` — Update scholarship
- `DELETE /scholarships/:id` — Delete scholarship
- `POST /scholarships/discover` — AI-powered scholarship discovery (searches web for nursing, healthcare, community service, state-specific, and college-specific scholarships). Returns results for user selection.
- `POST /scholarships/bulk-add` — Add multiple scholarships from discovery results
- `POST /scholarships/:id/hydrate` — Refresh scholarship data via web search
- `GET /scholarships/summary` — Aggregate: total tracked value, total awarded, budget impact

### Clinical Hours
- `GET /clinical` — List clinical log entries (filters: facility, department, dateRange, visibility based on auth)
- `GET /clinical/:id` — Get clinical entry detail
- `POST /clinical` — Create clinical log entry
- `PUT /clinical/:id` — Update clinical entry
- `DELETE /clinical/:id` — Delete clinical entry
- `GET /clinical/summary` — Aggregate stats (total hours, hours by facility, hours by department, patient interaction hours)
- `GET /clinical/supervisors` — List all supervisors from log entries with contact info and total hours
- `POST /clinical/export` — Generate PDF clinical hours log formatted for applications

### Certifications
- `GET /certifications` — List all certifications (filter by status)
- `GET /certifications/:id` — Get certification detail
- `POST /certifications` — Add certification
- `PUT /certifications/:id` — Update certification (status, dates, renewal info)
- `DELETE /certifications/:id` — Delete certification
- `POST /certifications/suggest` — AI suggests relevant certifications based on career goal
- `GET /certifications/expiring` — List certifications expiring within N days

### TEAS Prep
- `GET /teas` — List all TEAS records (practice tests, study sessions, official exams)
- `GET /teas/:id` — Get TEAS record detail
- `POST /teas` — Create TEAS record (practice test score, study session, or official exam)
- `PUT /teas/:id` — Update TEAS record
- `DELETE /teas/:id` — Delete TEAS record
- `GET /teas/progress` — Score progression over time (for charting)
- `POST /teas/study-plan` — AI generates personalized study plan based on scores, weak areas, target schools, and exam date
- `POST /teas/analyze` — AI analyzes score history, identifies trends and recommendations

### Interview Prep
- `GET /interviews` — List all interview sessions (mock + real)
- `GET /interviews/:id` — Get interview session detail
- `POST /interviews` — Create interview session
- `PUT /interviews/:id` — Update interview session (add answers, feedback)
- `DELETE /interviews/:id` — Delete interview session
- `POST /interviews/mock` — Start AI mock interview (accepts optional collegeId for tailored questions). Returns questions one at a time.
- `POST /interviews/mock/:sessionId/answer` — Submit answer to mock question, receive AI feedback
- `GET /interviews/questions` — Get question bank (filterable by category)
- `POST /interviews/questions` — Add custom question to bank

### Why Nursing
- `GET /why-nursing` — List all entries (filter by category, visibility based on auth)
- `GET /why-nursing/:id` — Get entry detail
- `POST /why-nursing` — Create entry
- `PUT /why-nursing/:id` — Update entry
- `DELETE /why-nursing/:id` — Delete entry

### Demonstrated Interest / Touchpoints
- `GET /colleges/:id/touchpoints` — List touchpoints for a college
- `POST /colleges/:id/touchpoints` — Add touchpoint
- `PUT /colleges/:id/touchpoints/:touchpointId` — Update touchpoint
- `DELETE /colleges/:id/touchpoints/:touchpointId` — Delete touchpoint
- `GET /touchpoints/follow-ups` — List all touchpoints with pending follow-ups across all colleges

### Contacts (Network)
- `GET /contacts` — List all contacts (filter by relationship, organization, isPotentialRecommender, linkedCollege)
- `GET /contacts/:id` — Get contact detail
- `POST /contacts` — Add contact
- `PUT /contacts/:id` — Update contact
- `DELETE /contacts/:id` — Delete contact
- `GET /contacts/recommenders` — List contacts flagged as potential recommenders, grouped by slot
- `POST /contacts/:id/recommender-brief` — AI generates a one-page summary of Keira's profile for this recommender to reference when writing a letter

### Campus Visits
- `GET /colleges/:id/visits` — List visits for a college
- `POST /colleges/:id/visits` — Create visit
- `PUT /colleges/:id/visits/:visitId` — Update visit (add impressions, answers to questions, pros/cons)
- `DELETE /colleges/:id/visits/:visitId` — Delete visit
- `POST /colleges/:id/visits/:visitId/prep` — AI generates visit prep: best time to visit, nursing-specific questions to ask, logistics, contact info
- `POST /visits/trip-plan` — AI suggests trip itineraries grouping nearby schools

### Peer Benchmarks
- `GET /colleges/:id/benchmark` — Get benchmark data for a college
- `POST /colleges/:id/benchmark/refresh` — AI researches competitive applicant profile for this school via web search
- `GET /benchmarks/aggregate` — Matrix view: all colleges × all metrics with Keira's stats compared
- `GET /benchmarks/gaps` — AI identifies biggest gaps across all target schools with specific recommendations

### Timeline
- `GET /timeline` — Unified timeline of all events across all modules (filters: dateRange, module/source, type)
- `GET /timeline/upcoming` — Next 30/60/90 days prioritized list
- `POST /timeline/analyze` — AI reviews timeline and provides priorities, conflicts, and missing items

---

## UI Screens (Key Screens)

### Navigation
- Top nav bar: Logo ("Keira's Journey") + primary module tabs
- Primary tabs (mobile bottom bar, first 5): Dashboard, Focus, Journal, Colleges, Applications
  (Applications is primary — essay writing is the app's end goal, so managing essays/applications
  must be one tap away on mobile; Scholarships and Timeline overflow to the More menu / drawer)
- Secondary nav (dropdown or sidebar): Scholarships, Timeline, Goals, Courses, TEAS Prep, Clinical Log, Certifications, Why Nursing, Contacts, Interview Prep
- Organize by usage frequency — Dashboard/Journal/Colleges are daily, others are weekly or seasonal
- User avatar + name in top right (switch not needed — each user logs in separately)
- AI chat button: floating bottom-right, opens slide-over panel
- Mobile: bottom tab bar with 5 primary modules, hamburger menu for the rest

### Key Interactions
- **Quick-add activity:** Available from any screen via a "+" FAB (floating action button) or top-bar button. Opens a modal with the minimal entry form.
- **College discovery:** From College Hub, a prominent "Discover BSN Programs" button triggers AI-powered web search. Results are displayed with checkboxes for bulk-add. Can be run multiple times with different filters.
- **Manual college add:** User enters just a school name → AI auto-hydrates all data via web search. No manual data entry required unless user wants to override.
- **Top Pick toggle:** Star icon on each college card — one click to mark/unmark. Top picks sort to the top of the list.
- **College refresh:** Per-college "Refresh Data" button or bulk "Refresh All" triggers re-hydration via fresh web searches. Useful as application seasons change.
- **Essay brainstorming:** From any essay workspace, a sidebar panel shows AI-suggested experiences and angles. Keira can pin/dismiss suggestions.

### Design Notes
- **Color palette:** Warm, approachable. Avoid clinical/corporate feel. Consider earth tones or soft blues/greens that feel aspirational but not sterile.
- **Typography:** Clean sans-serif. Good readability on mobile.
- **Empty states:** Every module should have a helpful empty state explaining what it's for and how to start. First-time experience matters.
- **Data density:** Dashboard is dense (good). Journal is spacious. College comparison is tabular. Match density to purpose.

---

## MVP Scope vs. Future

### MVP (Build Everything)

All features ship in v1. Future phases are net-new ideas, not deferred core functionality.

**Core Platform:**
- Auth (Cognito, 3 usernames — grahem, kate, keira)
- First-run experience (student profile setup, college discovery prompt, goal suggestion prompt)
- Master Timeline (unified calendar across all modules, upcoming prioritized view, AI analysis)
- Mobile-responsive design
- Zero seed data — everything populated via user input and real-time AI web search

**Module 1 — Dashboard:**
- Role-specific views (admin/parent sees budget + benchmarks, student sees streaks + motivation)
- GPA, activity counts, clinical hours, TEAS status, certification status, college list summary, scholarship pipeline, benchmark readiness, upcoming deadlines

**Module 2 — Activity Journal:**
- Full CRUD, privacy toggle, timeline/calendar/summary views, weekly reflection prompts

**Module 3 — College Hub:**
- AI discovery via web search, AI hydration, manual add with auto-hydration, notes, checklist, top pick toggle, filtering by name/state/program type, branding display with logos and school colors, college comparison side-by-side, fit score auto-calculation, demonstrated interest touchpoint log, campus visit planning + documentation, peer benchmark per college

**Module 4 — Goal Tracker:**
- Full CRUD, AI-suggested goals based on student profile, progress tracking, linked activities, kanban board

**Module 5 — Course Planner:**
- Full CRUD, GPA calculator with what-if mode, prerequisite mapper (courses × colleges matrix)

**Module 6 — Application Central:**
- Essay workspace with AI context panel drawing from all accumulated data (journal, clinical log, Why Nursing, private reflections)
- Recommendation strategy board (4 slots, contact linking, AI-generated recommender briefs)
- Test score tracker (SAT/ACT, TEAS, AP exams, score send tracking)
- Application status tracker with deadline countdown
- Financial aid tracker
- Decision matrix (for when acceptances come in)

**Module 7 — AI Assistant:**
- Ask mode, college discovery mode, essay partner mode, scholarship discovery mode — all with Bedrock web search
- Contextual awareness (knows which module/page user is on)

**Module 8 — Scholarship Discovery + Tracker:**
- AI-powered scholarship discovery via web search, manual add, status tracking, budget integration, deadline management

**Module 9 — TEAS Prep Center:**
- Practice test score logging with section breakdowns, score progression charts, AI-generated study plans, study session logging, official exam tracking

**Module 10 — Clinical Hours Log:**
- Structured nursing-format logging (facility, department, supervisor, duties, patient interaction flag), summary dashboard with benchmarks, supervisor directory, PDF export for applications

**Module 11 — Certifications Tracker:**
- Certification cards with status/expiration, AI-suggested certifications, training progress tracking, expiration alerts

**Module 12 — Interview Prep:**
- AI mock interviews with nursing-specific questions tailored to target schools, feedback grounded in Keira's actual experiences, question bank, real interview logging, progress tracking

**Module 13 — "Why Nursing" Living Document:**
- Categorized entries (moments, realizations, conversations, observations, inspirations), timeline view, full AI integration for essay writing, privacy support

**Module 14 — Demonstrated Interest + Contact Network:**
- Per-college touchpoint logging, contact rolodex, potential recommender flagging, recommender slot assignment, AI-generated recommender briefs

**Module 15 — Campus Visit Planner:**
- Visit planning with AI-generated nursing-specific questions, trip itinerary suggestions for out-of-state schools, post-visit documentation with pros/cons, travel cost tracking

**Module 16 — Peer Benchmark Dashboard:**
- Per-college competitive profile comparison, aggregate matrix view, gap analysis, progress tracking over time

**Module 17 — Master Timeline:**
- Unified calendar across all modules, color-coded by source, year/quarter/month views, AI-powered prioritization and conflict detection

**Export + Reports:**
- Clinical hours PDF export
- Activity summary PDF for counselors/recommendations
- AI-generated recommender briefs

### Future (Post-MVP — Ideas as they come)
- TBD — new features will emerge from actually using the app. Grahem will add/remove as needed via Claude Code.

---

## Development Notes

### For Claude Code Agents

- **Infrastructure first:** Set up Cognito, DynamoDB table, API Gateway, and one Lambda before touching frontend. Verify auth flow end-to-end.
- **Single DynamoDB table:** Use composite keys as specified. Don't create separate tables per entity — single-table design keeps things simple at this scale.
- **Bedrock region:** Use `us-east-1` or `us-west-2` for Claude model availability. Ensure Lambda execution role has `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` permissions.
- **Bedrock model ID:** `us.anthropic.claude-sonnet-4-20250514-v1:0` (or latest Sonnet available in Bedrock at build time)
- **Frontend framework:** React + Vite + Tailwind CSS. Deploy to S3 + CloudFront.
- **Auth implementation:** Use `@aws-amplify/auth` (v6+) in the React frontend. Configure with the Cognito User Pool ID and App Client ID. Wrap the app in an auth check — unauthenticated users see the login page, authenticated users see the app. Store tokens in memory only (Amplify handles this). The API Gateway Cognito JWT Authorizer validates tokens server-side with zero custom code. Login form uses username (not email) — just "grahem", "kate", or "keira" + password. Handle the `NEW_PASSWORD_REQUIRED` challenge on first login (Cognito forces temp password change).
- **API Gateway:** HTTP API (cheaper, simpler) with Cognito JWT authorizer.
- **Lambda:** Single Lambda with routing (or separate per resource — builder's choice). Node.js 20 or Python 3.12.
- **CORS:** Configure API Gateway CORS for the CloudFront domain.
- **Environment:** Use SSM Parameter Store or Lambda environment variables for config (DynamoDB table name, Bedrock model ID, etc.). No hardcoded values.

### College Hydration Architecture

- **Lambda timeout:** Discovery and hydration calls involve multiple Bedrock + web search round-trips. Set Lambda timeout to 5 minutes (300s) for hydration endpoints. Standard CRUD endpoints can use the default 30s.
- **Async hydration:** For bulk operations (discover + add 50 colleges), the API should return immediately with a job ID. Hydration runs asynchronously via SQS → Lambda. Frontend polls for hydration status per college.
- **Hydration queue:** Use SQS to queue individual college hydration jobs. One message per college. Lambda processes one at a time to avoid Bedrock throttling. Dead letter queue for failures.
- **Logo storage:** AI fetches a URL to the college's official logo during hydration. Store the URL in `branding.logoUrl`. Do NOT download and re-host logos — hotlink to the official source or use a known public logo API (e.g., Clearbit Logo API: `https://logo.clearbit.com/{domain}` as a fallback if AI can't find a direct logo URL). Display with appropriate fallback (generic graduation cap icon) if logo fails to load.
- **Hydration prompt structure:** Each hydration call should use a structured system prompt that instructs Bedrock to return JSON matching the College entity schema. Include a JSON schema in the prompt for reliable parsing. Web search tool must be enabled.
- **Idempotent hydration:** Re-running hydration on an already-hydrated college should update fields with newer data but preserve any user-edited fields. Add a `userEdited` list tracking which fields the user has manually changed — hydration skips those fields.

### Testing
- Manual testing is fine for MVP. This is a family app for 3 users.
- Verify: auth flow, activity CRUD with privacy, college CRUD, AI chat with web search, mobile responsiveness.

---

## v2.1 Feature Wave — Post-Launch Additions

**Status: Approved 2026-06-10 (Grahem). Implemented — all five features built and merged to `dev`.**

> As-built notes: Documents (F2), Opportunities (Module 18), and FinAid (Module 19) reuse the existing
> shared GSI1 collection pattern — **no new GSI / table migration** was needed (the GSI5 mention below
> is superseded). F4 **added** the `GET/PUT /profile` routes (a `StudentProfile` singleton); they did
> not previously exist. FinAid deadlines flow into the Master Timeline and the reminder digest.

Five gaps surfaced from a post-launch review of the deployed app. The app fully implements the
v2.0 spec; these are net-new capabilities that make the difference between *tracking* the journey
and *driving* it. Ship as **phased PRs to `dev`**, in the priority order below — each is independently
reviewable and deployable. Each subsection extends (does not replace) the v2.0 spec.

**Priority / ship order:**
1. **F1 — Deadline Reminders** (email digest) — highest leverage, smallest surface
2. **F2 — Document Storage** (S3 uploads)
3. **Module 18 — Opportunity Finder** (AI discovery of volunteer/shadowing/CNA opportunities)
4. **F4 — Guided First-Run Onboarding** (completes the v2.0 First-Run Experience)
5. **Module 19 — Financial Aid Center** (FAFSA/CSS timeline, net-price tooling, NursingCAS awareness)

Privacy, single-table DynamoDB, server-side auth off the JWT, no hardcoded config, and AI-on-Bedrock
all carry over unchanged. New AI features degrade gracefully to curated fallbacks like the existing ones.

---

### F1 — Deadline Reminders (Email Digest)

**Purpose:** The app is currently pull-only — a missed scholarship/cert/application deadline is silent.
A scheduled email digest pushes upcoming and overdue items to the family so nothing slips.

**Channel:** Amazon SES (v2) email digest (chosen over calendar sync / SMS for reliability + simplicity).
Because Cognito accounts are username-only (no email on file), recipient addresses are stored in
reminder settings, not derived from the user record.

**Cadence + "never repeat" (Grahem, 2026-06-10):** the digest defaults to **weekly** (Monday), and a
deadline is emailed **exactly once** — never repeated in later digests. A per-settings ledger
(`notifiedEventIds`) records every event id already sent; subsequent digests exclude them, so the
email is a nudge, not a weekly nag. (Tradeoff: an item is surfaced once even if it later goes overdue.)

**Data Model:**
```
PK: REMINDER_SETTINGS
SK: DETAILS
Attributes:
  - enabled: boolean (default true)
  - cadence: "daily" | "weekly" (default "weekly")
  - sendHourUTC: number (0-23, when the digest fires; default 13 = ~6-9am US)
  - weeklyDayOfWeek: number (0-6, used when cadence = "weekly"; default 1 = Monday)
  - horizonDays: number (look-ahead window for "upcoming"; default 30)
  - recipients: list of maps { label: string (e.g., "Keira", "Mom", "Dad"), email: string, includePrivate: boolean }
      - includePrivate is false for everyone except Keira's own address (private items never email a parent)
  - notifiedEventIds: list of strings (server-internal "never repeat" ledger; not user-editable)
  - lastSentAt: ISO timestamp
  - updatedBy: string (userId)
  - updatedAt: ISO timestamp
```

**Aggregation:** Reuses the master-timeline aggregation (`buildEvents`/`upcoming`, the same logic
behind `GET /timeline/upcoming`). The digest Lambda assembles overdue + next-`horizonDays` items
across colleges, scholarships, certifications (expirations/renewals), goals, application deadlines,
and campus visits — grouped "Overdue / This week / Next week / This month / Later", each linking back
into the app. Per-recipient content respects `includePrivate` (private-sourced items only appear in
Keira's own email) and excludes anything already in `notifiedEventIds` (never repeat).

**Infrastructure:**
- EventBridge rule (cron, **hourly** at minute 0) → **digest Lambda** (separate handler, 60s timeout).
- The hourly tick lets the Lambda honor the configured `sendHourUTC` (and, for weekly, `weeklyDayOfWeek`);
  it sends at most once/day, and records `lastSentAt` (same-UTC-day guard) + appends sent ids to the ledger.
- SES: verify the family sender identity + (in SES sandbox) the recipient addresses, OR request
  production access. Sender from config/env (`REMINDER_SENDER_EMAIL`), never hardcoded. Send via
  `@aws-sdk/client-sesv2`; least-privilege `ses:SendEmail` scoped to the account's SES identities.
- All new config (sender address, app URL, schedule) via env/CDK config. Added to the async stack.

**API:**
- `GET /reminders/settings` — get reminder settings (any user; returns defaults if none saved)
- `PUT /reminders/settings` — update cadence, recipients, horizon, enabled (ledger preserved server-side)
- `POST /reminders/send-test` — send the digest now (bypasses cadence + the ledger). With `{ to }`, sends a
  single test to that address using the caller's visibility; otherwise emails all configured recipients.

**Edge cases:** no recipients / disabled → Lambda no-ops; SES send failure → throws so the CloudWatch
error alarm fires (retried next tick); empty/already-notified digest → skip that recipient's send;
sender email unset → send-test returns 409 (config error) rather than failing silently.

**Acceptance criteria:**
- [x] Weekly digest emails configured recipients with correctly grouped overdue/upcoming items
- [x] Keira's email includes her private-deadline items; parents' emails never do
- [x] Each deadline is emailed once and never repeated (notifiedEventIds ledger)
- [x] Disabling reminders or clearing recipients stops all sends
- [x] "Send test" delivers a digest on demand; failures are visible (409/toast), not silent
- [x] Schedule + sender are config-driven (no hardcoded values), deployed via the async stack

**Test plan:** unit (digest assembly grouping + per-recipient private filtering; cadence/day/hour gating
logic); integration (settings CRUD; send-test path with a stubbed SES client); manual (deploy to
staging, set recipients to verified addresses, confirm a real digest arrives and links resolve).

---

### F2 — Document Storage (S3 Uploads)

**Purpose:** Over 4 years the family accumulates real artifacts — scanned certs, final essay PDFs,
transcripts, signed recommendation letters, financial-aid letters. Schema fields like `documentUrl`
exist but there is no upload pipeline. Add private file storage with presigned S3 upload/download.

**Scope (per approval):** attach to **Certifications**, **Application Central (essays & app docs)**,
**Recommendation letters (contacts/recommender slots)**, plus a **general document vault** catch-all.

**Data Model:**
```
PK: DOCUMENT#<documentId>
SK: DETAILS
Attributes:
  - fileName: string (original name)
  - contentType: string (MIME)
  - sizeBytes: number
  - s3Key: string (server-generated; never client-supplied)
  - category: "certificate" | "essay" | "application-doc" | "recommendation" | "transcript" | "financial-aid" | "visit-photo" | "other"
  - linkedEntity: map { type: "certification" | "essay" | "application" | "contact" | "college" | "scholarship" | null, id: string | null }
      - null/null = lives only in the general vault
  - visibility: "family" | "private"   (same model as journal/clinical; private = Keira only, AI sees all when Keira authed)
  - uploadedBy: string (userId)
  - notes: string
  - createdAt: ISO timestamp
  - updatedAt: ISO timestamp

GSI (vault + per-entity listing):
  GSI5PK: DOCUMENTS
  GSI5SK: <createdAt>#<documentId>
```

**Infrastructure:** new **private** S3 documents bucket (block all public access, SSE, lifecycle/versioning
optional), in the existing stack. No public read — all access via short-lived presigned URLs minted by
Lambda. Bucket name via env/SSM. Lambda role gets scoped `s3:PutObject/GetObject/DeleteObject` on that bucket only.

**Upload flow (presigned, two-step):**
1. `POST /documents/upload-url` → validates category/contentType/size, generates `s3Key` +
   presigned **PUT** URL; client uploads bytes directly to S3.
2. `POST /documents` → records the metadata after a successful upload (status confirmed via HEAD).

**API:**
- `GET /documents` — list (filters: category, linkedEntity, visibility-by-auth)
- `GET /documents/:id` — metadata + presigned **GET** download URL (visibility-enforced)
- `POST /documents/upload-url` — mint presigned PUT URL
- `POST /documents` — create metadata record
- `PUT /documents/:id` — update notes/category/visibility/links
- `DELETE /documents/:id` — delete metadata + S3 object

**UI:** an "Attachments" panel on Certification / essay / recommender / college detail views (list +
upload + download/delete), and a standalone **Documents** vault page (grid by category, filter, upload).
Private docs follow the lock affordance Keira already sees on journal entries.

**Edge cases:** size cap (e.g., 25MB) + content-type allowlist enforced server-side before minting URL;
orphaned S3 object if step 2 never runs → swept by a lifecycle rule on an `incoming/` prefix; presigned
URLs expire (≤5 min upload, ≤60s download); deleting a record deletes the object; non-student cannot
list/fetch/download a `private` document (enforced via the existing `assertCanRead`/`filterForRequester`).

**Acceptance criteria:**
- [ ] Family can upload a cert/essay/rec/transcript and download it later via presigned URL
- [ ] Documents attach to the right entity or live in the vault; vault lists everything visible to the caller
- [ ] Private documents are invisible/inaccessible to parent + admin; visible to Keira and the AI when Keira is authed
- [ ] Bucket blocks public access; no object is ever world-readable; size/type validated server-side
- [ ] Deleting a document removes both metadata and the S3 object

**Test plan:** unit (key generation, size/type validation, visibility filtering reuse); integration
(upload-url → put → create → get → delete round-trip with an in-memory/stubbed S3; private-doc 403 for
parent); manual (staging upload of a real PDF, download, privacy check).

---

### Module 18 — Opportunity Finder

**Purpose:** Hands-on experience hours are a key admission signal, yet the app only records them after
the fact. This module helps the family **find** opportunities — internships/apprenticeships, volunteering,
job shadowing, training/certification programs, summer programs, clubs, and relevant part-time roles near
them — mirroring the existing College/Scholarship AI discovery pattern. Found opportunities flow into
Experience Hours / Activity Journal.

> **MAJOR-AWARE, not nursing-only.** Types are generic (`volunteer`, `shadowing`, `internship`,
> `training-program`, `summer-program`, `job`, `club`, `other`) and the AI discovery is anchored to the
> active student's intended major (+ pack guidance) — e.g. construction internships/jobsite programs for a
> construction-management student, hospital volunteering/CNA for nursing. With no major set it stays
> field-generic (never nursing-default).

**Data Model:**
```
PK: OPPORTUNITY#<opportunityId>
SK: DETAILS
Attributes:
  - name: string
  - organization: string (e.g., "CHOC Children's", "Saddleback College")
  - type: "hospital-volunteer" | "shadowing" | "cna-program" | "summer-program" | "job" | "club" | "other"
  - location: string (city, state)
  - distanceNote: string (e.g., "~12 mi from Aliso Viejo")
  - description: string
  - eligibility: list of strings (e.g., "16+", "background check", "TB test")
  - timeCommitment: string (e.g., "4 hrs/week, 6-month min")
  - cost: number (0 if free)
  - applicationUrl: string
  - contact: map { name, email, phone }
  - applicationDeadline: ISO date (optional)
  - status: "discovered" | "interested" | "applied" | "active" | "completed" | "dismissed"
  - linkedActivityId: string (optional — once she starts logging hours)
  - linkedClinicalId: string (optional)
  - dataSources: list of strings (URLs)
  - addedBy: "ai-discovered" | "manual"
  - createdAt / updatedAt: ISO timestamp
```
Discovery is async (like college discovery), backed by a transient `OPPORTUNITY_DISCOVERY#<jobId>` job
on the shared SQS hydration queue; the web-grounded prompt (`converseWithSearch`, Tavily) is seeded with
the student's location/grade from the profile and the requested type. Frontend polls the job.

**API:**
- `GET /opportunities` — list (filters: type, status, search)
- `GET /opportunities/:id` / `POST` / `PUT` / `DELETE` — CRUD
- `POST /opportunities/discover` — async AI discovery (filters: type, radius, keyword); returns `202` + jobId
- `GET /opportunities/discover/:jobId` — poll discovery job
- `POST /opportunities/bulk-add` — add selected discovered opportunities

**UI:** new secondary-nav module. Empty state → "Find ways to get clinical & volunteer hours."
Discovery panel (type + location filters) → results with checkboxes → add. List view grouped by type
with status pills; "Log hours" action deep-links into Clinical Hours / Activity Journal pre-filled.

**Edge cases:** no results after search → friendly empty state, never fabricate; web search disabled →
falls back to model-only suggestions flagged `partial`; dismissed opportunities hidden from default list.

**Acceptance criteria:**
- [ ] AI discovers real, location-relevant opportunities with source URLs (async + polling, like colleges)
- [ ] Opportunities can be saved, status-tracked, and deep-link into hours logging
- [ ] Never fabricates a program/contact; degrades to `partial` when search is unavailable

**Test plan:** unit (prompt assembly with profile location; JSON parse + fallback); integration (discover
job lifecycle inline + via queue; CRUD); manual (staging discovery for "hospital volunteer near
<city>", confirm plausible cited results).

---

### F4 — Guided First-Run Onboarding

**Purpose:** The v2.0 "First-Run Experience" is only partially built — the backend profile/suggest
endpoints exist, but there's no guided wizard. New users land in an empty app with no path. Complete it.

**Behavior:** On login, if `STUDENT_PROFILE` is absent or `onboardingComplete` is false, show a 3-step
wizard (skippable at any step):
1. **Profile** — name, high school, graduation year, current GPA + type, career goal, location, budget
   → `PUT /profile` (reuses existing endpoint).
2. **Discover colleges** — prompt + button into the existing College Hub discovery flow (can skip).
3. **Suggest goals** — calls `POST /goals/suggest`, shows editable suggestions to accept/modify (can skip).
On finish/skip-all, set `onboardingComplete: true` on the profile so it doesn't reappear; re-runnable
later from Settings.

**Data Model:** extend `STUDENT_PROFILE` with `onboardingComplete: boolean` (default false). No new entities.

**API:** none new — reuses `GET/PUT /profile`, `POST /colleges/discover`, `POST /goals/suggest`.

**UI:** full-screen stepper shown above the app shell when triggered; progress dots; "Skip for now" on
every step; admin/parent can complete the profile on Keira's behalf.

**Edge cases:** partially-filled profile → resume where left off; skip-all still marks complete; empty DB
detection must not flash the wizard for an already-onboarded user mid-load.

**Acceptance criteria:**
- [ ] First login on an empty DB walks profile → discovery → goals, each skippable
- [ ] Completing or skipping all sets `onboardingComplete`; wizard doesn't reappear
- [ ] Re-runnable from Settings; works for a parent setting it up on Keira's behalf

**Test plan:** unit (trigger logic from profile state); integration (profile create flips the flag);
manual (fresh staging user sees the wizard once, not again).

---

### Module 19 — Financial Aid Center

**Purpose:** A $200K budget is central to the spec, but FAFSA/CSS appear only as goal-checklist text.
Add a home for the money mechanics: federal/institutional aid deadlines, net-price tooling, and
awareness that many nursing programs apply through **NursingCAS** (a centralized application service).

**Data Model:**
```
PK: FINAID#<itemId>
SK: DETAILS
Attributes:
  - kind: "fafsa" | "css-profile" | "state-aid" | "institutional-aid" | "loan" | "award-letter" | "other"
  - title: string
  - relatedCollegeId: string (optional — institutional aid forms are per-school)
  - openDate: ISO date (when the form opens — FAFSA typically Oct 1 / Dec)
  - deadline: ISO date
  - priorityDeadline: ISO date (optional — many schools have a priority FAFSA date)
  - status: "not-started" | "in-progress" | "submitted" | "received" | "n/a"
  - amountOffered: number (for award-letter items)
  - amountAccepted: number
  - documentId: string (optional — link to an uploaded award letter via F2)
  - notes: string
  - createdAt / updatedAt: ISO timestamp
```
Seedable defaults: when first opened, offer to create the standard FAFSA + CSS items for the student's
class year (editable, opt-in — consistent with goals/certs). Net-price calculator links are pulled per
college during existing hydration (store `contactInfo.netPriceCalculatorUrl` on the College entity).

**College entity additions (NursingCAS awareness):**
- `appServices: list of strings` (e.g., `["NursingCAS", "Common App", "Coalition", "Direct"]`)
- `usesNursingCAS: boolean`
These are populated by the existing college hydration prompt (add to its instructions/schema) and shown
on the college Overview + Application Central.

**API:**
- `GET /finaid` — list items (filters: kind, status, relatedCollege)
- `GET /finaid/:id` / `POST` / `PUT` / `DELETE` — CRUD
- `POST /finaid/seed` — create standard FAFSA/CSS items for the class year (returns editable set, opt-in)
- `GET /finaid/summary` — counts by status + nearest deadline (feeds Dashboard + reminders)

**Integration:** FinAid deadlines flow into the **Master Timeline** and the **F1 reminder digest**
(orange "financial aid" source). Award-letter amounts can attach an uploaded PDF via F2 and inform the
Budget view alongside scholarships.

**UI:** new secondary-nav module — deadline-sorted list with countdowns + status, "Seed FAFSA/CSS"
action, per-college net-price-calculator links, award-letter tracking. NursingCAS badge on colleges that use it.

**Edge cases:** FAFSA open/deadline dates shift yearly → dates are editable, seed uses current cycle;
`n/a` status hides an item from countdowns; net-price URL absent → graceful omission.

**Acceptance criteria:**
- [ ] FAFSA/CSS + per-school aid deadlines tracked with countdowns and status
- [ ] FinAid deadlines appear in the Master Timeline and the email digest
- [ ] College records surface NursingCAS/Common App usage and a net-price-calculator link when hydrated
- [ ] Award letters can be recorded (and optionally attached as a document)

**Test plan:** unit (seed generation for a class year; summary/nearest-deadline calc); integration
(CRUD; timeline + digest pick up finaid items; hydration populates appServices); manual (staging: seed,
confirm timeline/digest inclusion, check a hydrated college shows NursingCAS where applicable).

---

### v2.1 Infrastructure Summary

- **SES** (F1): sender identity verified; recipients verified or production access requested; send via SDK.
- **EventBridge Scheduler** (F1): daily trigger → digest Lambda (in the async stack).
- **S3 documents bucket** (F2): private, public-access-blocked, SSE, scoped IAM, presigned URLs only.
- **SQS reuse** (Module 18): opportunity discovery rides the existing shared hydration queue + DLQ.
- **DynamoDB**: all new entities on the single table; one new GSI (`GSI5` for documents/vault).
- **Config**: sender address, bucket name, schedule, NursingCAS flag — all env/SSM, none hardcoded.
- **No prod cutover** without Grahem's explicit go (Gate 3 rule unchanged); ship to `dev` → staging first.

---

## Budget Summary

**Infrastructure cost estimate (monthly):**
- DynamoDB (on-demand): ~$0 (free tier covers this usage)
- Lambda: ~$0 (free tier covers this usage)
- API Gateway: ~$0 (free tier covers this usage)
- S3 + CloudFront: ~$1-2
- Cognito: $0 (free for <50K users)
- Bedrock (Claude Sonnet): ~$10-30 depending on AI usage (more features now — mock interviews, study plans, scholarship discovery, benchmark research, recommender briefs all hit Bedrock)
- Route 53: ~$0.50/month for hosted zone
- SES (v2.1 digest): ~$0 (well under the free tier at family volume)
- S3 documents bucket (v2.1): ~$0 (a few hundred MB of PDFs is negligible)
- EventBridge Scheduler (v2.1): ~$0
- **Total: ~$12-35/month**

---

*Last updated: June 10, 2026*
*Version: 2.1 (Draft) — Post-launch feature wave. Added: Deadline Reminders (email digest), Document Storage (S3), Opportunity Finder (Module 18), Guided First-Run Onboarding, Financial Aid Center (Module 19). Awaiting Grahem approval before implementation.*
*Version: 2.0 — Full 17-module spec. Added: Scholarship Tracker, TEAS Prep, Clinical Hours Log, Certifications, Interview Prep, Why Nursing, Demonstrated Interest + Contacts, Campus Visits, Peer Benchmarks, Master Timeline*
*Authors: Grahem + Claude*