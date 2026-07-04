// Domain types for every entity in the single-table data model.
// Source of truth: spec/keirasjourney-spec.md → "Data Model". These are the shapes the
// data-access library returns to callers (internal PK/SK/GSI attributes are stripped).
//
// Visibility is a DOMAIN field here, but filtering by it is NOT done in this library — it
// is enforced in the API/auth layer off the caller's JWT (see specs/foundational/auth.md),
// because the AI path needs unfiltered access when keira is the caller. The lib returns raw.

export type Visibility = 'family' | 'private';
export type Role = 'admin' | 'parent' | 'student' | 'member';

/** Fields the library stamps/owns on every stored entity. */
export interface Timestamped {
  createdAt: string; // ISO-8601 UTC, set on create
  updatedAt: string; // ISO-8601 UTC, set on create + every update
}

/** Hydratable entities carry the names of fields a human has edited, so AI re-hydration
 *  never clobbers user edits. Managed via `mergePreservingUserEdits`. */
export interface Hydratable {
  userEdited?: string[];
  lastDataRefresh?: string;
  hydrationStatus?: 'pending' | 'in-progress' | 'complete' | 'partial' | 'failed';
  addedBy?: 'ai-discovered' | 'manual';
}

// ---------------------------------------------------------------------------
// Tenant (PK: TENANT#<tenantId>, SK: DETAILS) — the one intentionally-GLOBAL namespace (SaaS
// platform). A tenant is a family. Written/read via the un-scoped base client (never tenant-prefixed),
// and enumerable via a GSI1PK='TENANTS' collection so background jobs can iterate all families.
// ---------------------------------------------------------------------------
export interface Tenant extends Timestamped {
  tenantId: string;
  familyName: string;
  plan: 'free' | 'family';
  status: 'active' | 'suspended' | 'past_due';
  /** Parental-consent capture (hook for the compliance sub-project). */
  consent?: { acceptedAt?: string; tosVersion?: string; byEmail?: string };
}

// ---------------------------------------------------------------------------
// Invite (PK: INVITE#<code>, SK: DETAILS; collection GSI1PK='INVITES') — GLOBAL namespace, base client.
// A super-admin (Grahem) issues a single-use code to a family's email; redeeming it provisions a tenant.
// The v1 front door (sub-project 2). Free comp by default.
// ---------------------------------------------------------------------------
export interface Invite extends Timestamped {
  code: string;
  email: string;
  familyName?: string;
  plan: 'free' | 'family';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invitedBy: string; // super-admin username
  expiresAt?: string;
  acceptedTenantId?: string;
}

// ---------------------------------------------------------------------------
// Student (PK: STUDENT#<studentId>, SK: DETAILS; collection GSI1PK='STUDENTS') — FAMILY-LEVEL
// (tenant-scoped, NOT per-child). The roster of children in a family and the source for the
// active-student switcher. A family has one or more. Per-child data is keyed under the active
// student id (`T#<tenant>#S#<studentId>#…`); this registry is what enumerates those students.
// Lightweight on purpose — the rich academic data lives in the per-child StudentProfile singleton.
// ---------------------------------------------------------------------------
export interface Student extends Timestamped {
  studentId: string;
  name: string;
  graduationYear?: number;
  status: 'active' | 'archived';
}

// ---------------------------------------------------------------------------
// Family member (PK: MEMBER#<userId>, SK: DETAILS; collection GSI1PK='MEMBERS') — FAMILY-LEVEL
// (tenant-scoped). Everyone with login access to a family's account: the managing guardians AND the
// wider circle (grandparents, aunts/uncles, family friends, counselors, mentors). Two independent
// axes: `relationship` is descriptive (who they are); `accessLevel` is what they can do — `manager`
// (full: manage the family, invite, edit → JWT role 'parent') or `viewer` (read-only, no private,
// no management → JWT role 'member'). The student (the kid) is tracked in the Student roster, not here.
// ---------------------------------------------------------------------------
export type MemberRelationship =
  | 'parent'
  | 'grandparent'
  | 'aunt-uncle'
  | 'sibling'
  | 'family-friend'
  | 'counselor'
  | 'mentor'
  | 'other';

export type MemberAccessLevel = 'manager' | 'viewer';

export interface FamilyMember extends Timestamped {
  /** Cognito username (the invitee's email). Stable id for the member record. */
  userId: string;
  email: string;
  displayName?: string;
  relationship: MemberRelationship;
  accessLevel: MemberAccessLevel;
  status: 'invited' | 'active';
  /** Username of the guardian/admin who invited them. */
  invitedBy?: string;
}

// ---------------------------------------------------------------------------
// User profile (PK: USER#<userId>, SK: PROFILE)
// ---------------------------------------------------------------------------
export interface Profile extends Timestamped {
  userId: string;
  name: string;
  email?: string;
  role: Role;
  preferences?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// College (PK: COLLEGE#<collegeId>, SK: DETAILS)
// ---------------------------------------------------------------------------
export type CollegeStatus =
  | 'researching'
  | 'considering'
  | 'target'
  | 'applying'
  | 'applied'
  | 'accepted'
  | 'rejected'
  | 'enrolled'
  | 'removed';

export interface College extends Timestamped, Hydratable {
  collegeId: string;
  name: string;
  location?: string;
  state?: string;
  programType?:
    | 'direct-admit'
    | 'secondary-application'
    | 'accelerated'
    | 'transfer-pathway';
  isDirectAdmit?: boolean;
  isTopPick?: boolean;
  ranking?: string;
  /** AI narrative (2-3 paragraphs): what makes this school/program distinctive + who it fits. */
  overview?: string;
  /** AI narrative (1-2 paragraphs): exactly how a student gets in — pathways, timeline, selectivity. */
  admissionsDeepDive?: string;
  employmentRate?: string;
  tuitionInState?: number;
  tuitionOutOfState?: number;
  /** Annual full cost of attendance (tuition + fees + housing + food + books) — sticker before aid. */
  costOfAttendanceOutOfState?: number;
  /** Annual cost AFTER grants & scholarships — the real out-of-pocket figure; distinct from tuition. */
  estimatedNetPriceAfterAid?: number;
  percentReceivingAid?: string;
  avgAidAmount?: number;
  applicationFee?: number;
  estimatedTotalCost?: number;
  estimatedCostAfterAid?: number;
  acceptanceRateProgram?: string;
  acceptanceRateUniversity?: string;
  avgGPAAdmitted?: string;
  prerequisites?: string[];
  /** Generic major-specific facts as labeled values (e.g. nursing → "NCLEX-RN pass rate" / "92%").
   *  Populated by major-aware hydration; replaces hardcoded per-major fields. */
  programDetails?: { label: string; value: string }[];
  applicationDeadlines?: { earlyAction?: string; regularDecision?: string; programApp?: string };
  essayPrompts?: string[];
  requiredTests?: string[];
  /** Authentic student voices, each with a source URL for verification. */
  testimonials?: { quote: string; attribution?: string; source?: string }[];
  /** URLs to campus/program photos for the branded header gallery. */
  campusImageUrls?: string[];
  specialNotes?: string;
  website?: string;
  /** URLs the AI relied on during the most recent hydration (shown as "Sources"). */
  dataSources?: string[];
  /** Readable titles for `dataSources`, resolved during hydration (search-result title, else the page
   *  <title>). Only entries we could title; the UI falls back to URL parsing for any not listed. */
  dataSourceTitles?: { url: string; title: string }[];
  /** Academic year the hydrated figures reflect, e.g. "2025-2026". */
  dataAsOf?: string;
  branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; mascot?: string };
  contactInfo?: {
    programAdmissionsPhone?: string;
    programAdmissionsEmail?: string;
    programAdmissionsUrl?: string;
    financialAidPhone?: string;
    financialAidUrl?: string;
    campusVisitUrl?: string;
    netPriceCalculatorUrl?: string;
  };
  /** Application services this school accepts (e.g. "NursingCAS", "Common App") — v2.1 Module 19. */
  appServices?: string[];
  /** True if the program applies through a centralized application service (e.g. NursingCAS). */
  usesCAS?: boolean;
  status?: CollegeStatus;
  fitScore?: number;
  // Campus imagery + cached logo, written by the async assets worker (college-assets) — never the
  // text hydrator. System-owned: not in the create/update schema; merged so a manual edit is kept.
  /** CloudFront URL of the cached campus photo (sourced from Wikimedia). */
  campusImageUrl?: string;
  /** Attribution/license for the campus photo (Wikimedia Commons expects visible credit). */
  campusImageCredit?: string;
  /** CloudFront URL of the cached school logo (sourced from Clearbit by website domain). */
  logoImageUrl?: string;
  /** Asset-fetch lifecycle, polled independently of `hydrationStatus`. */
  assetsStatus?: 'pending' | 'in-progress' | 'complete' | 'failed';
  /** AI-generated "how to prepare in high school for THIS college's program" plan — recommended HS
   *  classes, academic targets (GPA/tests, from this college's admission bar), and activities/certs.
   *  System-owned: generated on demand via POST /colleges/:id/prep, merged so it persists; never in
   *  the create/update schema. Distinct from `prerequisites` (the college's own program-level reqs). */
  hsPrepPlan?: HsPrepPlan;
  /** Prep-plan generation lifecycle, polled by the UI. Generation is a 20s+ model call, so it runs
   *  ASYNC on the SQS worker (like hydration) rather than on the 30s request path: the API sets
   *  'in-progress' and enqueues, the worker fills `hsPrepPlan` and flips this to 'complete'/'failed'. */
  hsPrepStatus?: 'pending' | 'in-progress' | 'complete' | 'failed';
}

/** One recommendation in a high-school prep plan: a short label + an optional one-line "why/how". */
export interface HsPrepItem {
  label: string;
  detail?: string;
}

/** AI prep plan: what a high-school student should aim for and take to be competitive for a specific
 *  college's program. Grounded in the college's hydrated admission data + the student's intended major. */
export interface HsPrepPlan {
  /** One-line framing of how to position for this program. */
  headline?: string;
  /** Academic targets to hit in high school (GPA, SAT/ACT) — from this college's real admission bar. */
  targets: HsPrepItem[];
  /** Recommended high-school classes (e.g. AP Physics, AP Calculus, Anatomy & Physiology). */
  courses: HsPrepItem[];
  /** Activities, certifications, and experiences that strengthen the application for this major. */
  activities: HsPrepItem[];
}

/** One discovered candidate (College-shaped, name required) — the result of a discovery run. */
export interface DiscoveredCollege {
  name: string;
  location?: string;
  state?: string;
  programType?: College['programType'];
  isDirectAdmit?: boolean;
  ranking?: string;
  tuitionInState?: number;
  tuitionOutOfState?: number;
  website?: string;
  summary?: string;
}

/**
 * A transient async discovery job. The API creates one (status 'pending') and enqueues it; the SQS
 * worker runs the web-grounded discovery (which can exceed the 30s API budget) and writes the
 * candidates back; the frontend polls until it settles. PK: DISCOVERY#<jobId>, SK: DETAILS.
 */
export interface DiscoveryJob extends Timestamped {
  jobId: string;
  status: 'pending' | 'complete' | 'failed';
  /** The discovery filters echoed from the request, so the worker can run the search. */
  filters?: {
    query?: string;
    state?: string;
    programType?: College['programType'];
    maxTuition?: number;
    directAdmitOnly?: boolean;
    limit?: number;
  };
  candidates?: DiscoveredCollege[];
  count?: number;
  error?: string;
}

export interface CollegeNote extends Timestamped {
  collegeId: string;
  noteId: string; // derived from the SK timestamp
  author: string;
  content: string;
  noteType?: 'general' | 'visit' | 'research' | 'contact' | 'financial-aid' | 'application-update';
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedDate?: string;
  completedBy?: string;
  dueDate?: string;
}

export interface CollegeChecklist extends Timestamped {
  collegeId: string;
  items: ChecklistItem[];
}

export interface Touchpoint extends Timestamped {
  collegeId: string;
  touchpointId: string;
  type:
    | 'info-session'
    | 'campus-visit'
    | 'email-exchange'
    | 'phone-call'
    | 'webinar'
    | 'college-fair'
    | 'interview'
    | 'social-media'
    | 'other';
  date: string;
  description?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  followUpNeeded?: boolean;
  followUpDate?: string;
  followUpCompleted?: boolean;
  notes?: string;
  createdBy?: string;
}

export interface Visit extends Timestamped {
  collegeId: string;
  visitId: string;
  date: string;
  visitType?: 'campus-tour' | 'department-visit' | 'open-house' | 'admitted-student-day' | 'overnight' | 'virtual';
  attendees?: string[];
  questionsToAsk?: { question: string; answer?: string; askedTo?: string }[];
  impressions?: string;
  pros?: string[];
  cons?: string[];
  photos?: string[];
  wouldAttend?: 'yes' | 'no' | 'maybe' | 'undecided';
  travelCost?: number;
  createdBy?: string;
  /** Cached visit prep (best time, questions to ask, logistics), generated when the visit is saved so
   *  the UI can show/hide it without re-generating each time. System-owned — never client-supplied. */
  prep?: {
    bestTime: string;
    questions: string[];
    logistics: { address?: string; parking?: string; contact?: string; campusVisitUrl?: string };
    source: 'ai' | 'curated';
    generatedAt?: string;
  };
}

export interface Benchmark extends Timestamped, Hydratable {
  collegeId: string;
  avgGPAAdmitted?: number;
  avgTEASScore?: number;
  avgSATScore?: number;
  typicalClinicalHours?: number;
  typicalVolunteerHours?: number;
  typicalCertifications?: string[];
  typicalExtracurriculars?: string;
  competitiveEdges?: string[];
  keirasComparison?: {
    gpaStatus?: 'above' | 'at' | 'below';
    teasStatus?: 'above' | 'at' | 'below' | 'not-taken';
    clinicalHoursStatus?: 'above' | 'at' | 'below';
    volunteerHoursStatus?: 'above' | 'at' | 'below';
    overallReadiness?: 'strong' | 'competitive' | 'needs-work' | 'insufficient-data';
  };
}

/** One month's point-in-time snapshot of the student's competitive readiness, for the
 *  progress-over-time trend ("are gaps closing?"). Captured lazily — at most once per calendar
 *  month, when the benchmark dashboard is loaded — so the series builds without a scheduler. */
export interface BenchmarkSnapshot {
  month: string; // 'YYYY-MM' — the calendar month this snapshot represents (one per month)
  capturedAt: string; // ISO timestamp it was recorded
  // The student's own stats at capture time (these rise objectively as she progresses).
  gpa?: number;
  teasScore?: number;
  clinicalHours: number;
  volunteerHours: number;
  certCount: number;
  // Across the colleges that have benchmark data at capture time:
  collegesWithData: number;
  /** How many of those colleges she is BELOW on each metric — the gap count that should shrink. */
  belowGpa: number;
  belowTeas: number;
  belowClinicalHours: number;
  belowVolunteerHours: number;
  /** Readiness mix across those colleges. */
  strongCount: number;
  competitiveCount: number;
  needsWorkCount: number;
}

/** Per-student rolling history of monthly benchmark snapshots (newest last; capped). Singleton. */
export interface BenchmarkHistory extends Timestamped {
  snapshots: BenchmarkSnapshot[];
}

// ---------------------------------------------------------------------------
// Activity / Journal (PK: ACTIVITY#<id>, SK: DETAILS) — GSI1 date, GSI2 category
// ---------------------------------------------------------------------------
export type ActivityCategory =
  | 'volunteer'
  | 'clinical'
  | 'academic'
  | 'athletic'
  | 'leadership'
  | 'personal'
  | 'work'
  | 'award'
  | 'other';

export interface Activity extends Timestamped {
  activityId: string;
  userId: string;
  date: string;
  category: ActivityCategory;
  subcategory?: string;
  title: string;
  description?: string;
  hours?: number;
  reflection?: string;
  visibility: Visibility;
  tags?: string[];
  linkedColleges?: string[];
}

// ---------------------------------------------------------------------------
// Goal (PK: GOAL#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface Goal extends Timestamped {
  goalId: string;
  title: string;
  description?: string;
  category?: 'academic' | 'clinical' | 'extracurricular' | 'test-prep' | 'application' | 'personal';
  targetDate?: string;
  period?: string;
  status?: 'not-started' | 'in-progress' | 'completed' | 'deferred' | 'dropped';
  progress?: number;
  milestones?: { id: string; label: string; completed: boolean; completedDate?: string }[];
  linkedActivities?: string[];
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Course (PK: COURSE#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface Course extends Timestamped {
  courseId: string;
  name: string;
  type?: 'regular' | 'honors' | 'AP' | 'dual-enrollment';
  subject?: 'math' | 'science' | 'english' | 'social-studies' | 'world-language' | 'elective' | 'health-sciences';
  year?: 'freshman' | 'sophomore' | 'junior' | 'senior';
  semester?: 'fall' | 'spring' | 'full-year' | 'summer';
  grade?: string;
  gradePoints?: number;
  units?: number;
  satisfiesPrereq?: { collegeId: string; prereqName: string }[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Essay (PK: ESSAY#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface Essay extends Timestamped {
  essayId: string;
  collegeId?: string;
  prompt?: string;
  promptSource?: string;
  drafts?: { version: number; content: string; createdAt: string; wordCount?: number }[];
  status?: 'brainstorming' | 'drafting' | 'reviewing' | 'final';
  aiSuggestedActivities?: string[];
  aiSuggestedAngles?: string[];
  /** Compact summary of the most recent AI rubric review (full review is returned live, never
   *  persisted). Safe to store: derived only from the draft text, never from private entries. */
  lastReview?: {
    overall: number;
    verdict: 'ready' | 'close' | 'keep-working';
    wordCount: number;
    version?: number;
    reviewedAt: string;
  };
  notes?: string;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Application (PK: APPLICATION#<applicationId>, SK: DETAILS) — GSI1 by deadline.
// One per college: the senior-year tracker row. Component statuses replace the old
// single hasTeasScore bool; test-score routing lives on TestScore.sentTo.
// ---------------------------------------------------------------------------
export type ApplicationComponentStatus =
  | 'not-started'
  | 'in-progress'
  | 'submitted'
  | 'complete'
  | 'waived';

export type ApplicationStatus =
  | 'planning'
  | 'in-progress'
  | 'submitted'
  | 'under-review'
  | 'decided'
  | 'withdrawn';

export type ApplicationDecision = 'none' | 'accepted' | 'waitlisted' | 'deferred' | 'rejected';

export interface Application extends Timestamped {
  applicationId: string;
  collegeId: string;
  status?: ApplicationStatus;
  applicationType?: 'early-action' | 'early-decision' | 'regular-decision' | 'rolling';
  deadline?: string;
  submittedDate?: string;
  /** Per-component readiness for the tracker grid (essay / rec / transcript / scores / aid). */
  components?: {
    essay?: ApplicationComponentStatus;
    recommendations?: ApplicationComponentStatus;
    transcript?: ApplicationComponentStatus;
    testScores?: ApplicationComponentStatus;
    financialAid?: ApplicationComponentStatus;
  };
  decision?: ApplicationDecision;
  decisionDate?: string;
  notes?: string;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Recommendation (PK: RECOMMENDATION#<recommendationId>, SK: DETAILS) — rec-strategy board.
// Four canonical slots; assigned to a contact; status asked→agreed→received→submitted.
// ---------------------------------------------------------------------------
export type RecommendationSlot =
  | 'stem-teacher'
  | 'humanities-teacher'
  | 'clinical-supervisor'
  | 'community-leader'
  | 'other';

export type RecommendationStatus =
  | 'identified'
  | 'asked'
  | 'agreed'
  | 'received'
  | 'submitted'
  | 'declined';

export interface Recommendation extends Timestamped {
  recommendationId: string;
  slot: RecommendationSlot;
  contactId?: string;
  contactName?: string;
  relationshipStrength?: 'strong' | 'moderate' | 'developing';
  status?: RecommendationStatus;
  askTimeline?: string;
  askedDate?: string;
  receivedDate?: string;
  /** Colleges this letter has been submitted to. */
  submittedColleges?: string[];
  /** AI-generated recommender brief (regenerable; never persisted from private content). */
  aiBrief?: string;
  notes?: string;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// TestScore (PK: TESTSCORE#<scoreId>, SK: DETAILS) — GSI1 by testDate.
// Per-test record with per-college send routing (sentTo).
// ---------------------------------------------------------------------------
export type TestScoreType = 'SAT' | 'ACT' | 'TEAS' | 'AP';

export interface TestScore extends Timestamped {
  scoreId: string;
  testType: TestScoreType;
  testDate?: string;
  /** Composite/total (SAT total, ACT composite, TEAS overall, AP 1-5). */
  score?: number;
  sectionScores?: Record<string, number>;
  /** AP subject, when testType === 'AP'. */
  apSubject?: string;
  /** Best superscore across sittings, when tracked. */
  superscore?: number;
  /** collegeIds this score has been sent to. */
  sentTo?: string[];
  official?: boolean;
  notes?: string;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Scholarship (PK: SCHOLARSHIP#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface Scholarship extends Timestamped, Hydratable {
  scholarshipId: string;
  name: string;
  provider?: string;
  amount?: number;
  amountDescription?: string;
  type?:
    | 'merit'
    | 'need-based'
    | 'major-specific'
    | 'community-service'
    | 'diversity'
    | 'state-specific'
    | 'organization'
    | 'other';
  eligibility?: string[];
  applicationDeadline?: string;
  applicationUrl?: string;
  requiredMaterials?: string[];
  linkedColleges?: string[];
  isRenewable?: boolean;
  renewalRequirements?: string;
  status?: 'discovered' | 'researching' | 'preparing' | 'applied' | 'awarded' | 'denied' | 'expired';
  awardedAmount?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Experience hours (PK: EXPERIENCE#<id>, SK: DETAILS) — GSI3 facility
// ---------------------------------------------------------------------------
export interface ExperienceEntry extends Timestamped {
  entryId: string;
  date: string;
  facility: string;
  department?: string;
  supervisorName?: string;
  supervisorTitle?: string;
  supervisorContact?: string;
  hours: number;
  duties?: string[];
  patientInteraction?: boolean;
  reflection?: string;
  visibility: Visibility;
  linkedActivityId?: string;
}

// ---------------------------------------------------------------------------
// Certification (PK: CERT#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface Certification extends Timestamped {
  certId: string;
  name: string;
  issuingOrganization?: string;
  certificationNumber?: string;
  dateEarned?: string;
  expirationDate?: string | null;
  renewalRequired?: boolean;
  renewalFrequency?: string;
  renewalRequirements?: string;
  status?: 'planned' | 'in-progress' | 'active' | 'expiring-soon' | 'expired' | 'renewed';
  trainingProgram?: string;
  trainingHours?: number;
  cost?: number;
  documentUrl?: string;
  notes?: string;
}

/** The researched "how & where to get it" payload for a certification (a subset is web-grounded:
 *  local providers near the student). Stored on a CertGuidanceJob; rendered on suggestion + tracked
 *  cards. All fields optional — research degrades to "general guidance" (no local list) gracefully. */
export interface CertGuidanceResult {
  /** The official issuer / where to register (a URL). */
  officialUrl?: string;
  /** A short paragraph: the path to obtain the cert (steps, format, who offers it). */
  howToGet?: string;
  /** Prerequisites / eligibility, if any. */
  prerequisites?: string;
  typicalCost?: number;
  renewalFrequency?: string;
  /** Specific local/nearby places to get it (web-grounded; empty when search is unavailable). */
  localProviders?: { name: string; detail?: string; url?: string }[];
  /** Source URLs the research drew on. */
  sources?: string[];
}

/**
 * A transient async "how to get this cert" research job (mirrors DiscoveryJob). The API creates one
 * (status 'pending') with the cert name + the student's location and enqueues it; the 300s SQS worker
 * runs the web-grounded research and writes the result back; the frontend polls until it settles.
 * PK: CERTGUIDANCE#<jobId>, SK: DETAILS.
 */
export interface CertGuidanceJob extends Timestamped {
  jobId: string;
  certName: string;
  /** The student's location ("City, ST") echoed from their profile, so the worker can localize. */
  location?: string;
  status: 'pending' | 'complete' | 'failed';
  result?: CertGuidanceResult;
  error?: string;
}

// ---------------------------------------------------------------------------
// Exam record (PK: EXAM#<id>, SK: DETAILS) — GSI4 date
// ---------------------------------------------------------------------------
export interface ExamScore extends Timestamped {
  recordId: string;
  /** Name of the exam this record tracks (e.g. "SAT", "ACT", "TEAS"); unset = generic. */
  examName?: string;
  type: 'practice-test' | 'study-session' | 'official-exam';
  date: string;
  overallScore?: number;
  sectionScores?: { reading?: number; math?: number; science?: number; englishLanguageUsage?: number };
  source?: string;
  studyTopics?: string[];
  studyDuration?: number;
  weakAreas?: string[];
  strongAreas?: string[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Interview prep (PK: INTERVIEW#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface Interview extends Timestamped {
  sessionId: string;
  /** Owner (JWT username), stamped server-side on create. Used to scope private-derived fields
   *  (per-question aiFeedback/answer that may quote keira's private entries) to the owner — session
   *  metadata stays family-visible, but those fields are stripped for non-owners. */
  createdBy: string;
  type: 'mock-practice' | 'real-interview';
  collegeId?: string;
  date: string;
  questions?: {
    question: string;
    answer?: string;
    aiFeedback?: string;
    rating?: number;
    linkedActivities?: string[];
  }[];
  overallNotes?: string;
  confidenceLevel?: number;
}

// ---------------------------------------------------------------------------
// Motivation (PK: MOTIVATION#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface Motivation extends Timestamped {
  entryId: string;
  date: string;
  title: string;
  content: string;
  category?: 'moment' | 'realization' | 'conversation' | 'observation' | 'experience' | 'inspiration';
  linkedActivityId?: string;
  linkedClinicalId?: string;
  tags?: string[];
  visibility: Visibility;
}

// ---------------------------------------------------------------------------
// Contact (PK: CONTACT#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface Contact extends Timestamped {
  contactId: string;
  name: string;
  role?: string;
  organization?: string;
  relationship?: 'mentor' | 'supervisor' | 'teacher' | 'admissions' | 'professional' | 'recommender' | 'other';
  phone?: string;
  email?: string;
  linkedCollegeId?: string;
  howMet?: string;
  dateMet?: string;
  lastContactDate?: string;
  notes?: string;
  isPotentialRecommender?: boolean;
  recommenderSlot?: string;
}

// ---------------------------------------------------------------------------
// AI conversation (PK: CONVERSATION#<id>, SK: MESSAGE#<ts> | DETAILS)
// ---------------------------------------------------------------------------
export interface Conversation extends Timestamped {
  conversationId: string;
  userId: string;
  context?: string;
  title?: string;
}

export interface ConversationMessage extends Timestamped {
  conversationId: string;
  messageId: string; // derived from the SK timestamp
  role: 'user' | 'assistant';
  userId: string;
  content: string;
  context?: string;
  toolsUsed?: string[];
}

// ---------------------------------------------------------------------------
// Budget (PK: BUDGET, SK: DETAILS) — global singleton
// ---------------------------------------------------------------------------
export interface Budget extends Timestamped {
  totalBudget: number;
  currency?: 'USD';
  notes?: string;
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Reminder settings (PK: REMINDER_SETTINGS, SK: DETAILS) — global singleton.
// Drives the scheduled email digest of upcoming/overdue deadlines (v2.1 F1).
// ---------------------------------------------------------------------------

/** One person the digest emails. PRIVATE items (Keira's private journal/clinical/why-nursing
 *  entries) are NEVER included in any email — an outbound digest is not the AI helping Keira
 *  interactively, so private content must never leave the app this way. No per-recipient toggle. */
export interface ReminderRecipient {
  label: string; // "Keira", "Mom", "Dad"
  email: string;
}

export interface ReminderSettings extends Timestamped {
  enabled: boolean;
  cadence: 'daily' | 'weekly';
  sendHourUTC: number; // 0-23 — the digest fires only on this UTC hour
  weeklyDayOfWeek: number; // 0-6 (0 = Sunday); used when cadence = 'weekly'
  horizonDays: number; // look-ahead window for "upcoming" items
  recipients: ReminderRecipient[];
  lastSentAt?: string; // ISO timestamp of the last successful send (idempotency guard)
  // Event ids already emailed in a scheduled digest. Items here are NEVER re-sent — each deadline
  // appears in exactly one weekly digest and never nags again (Grahem: "weekly, never repeat").
  notifiedEventIds?: string[];
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Setup state (PK: SETUP, SK: DETAILS) — family-level singleton.
// FTUE progress for the multi-student onboarding loop: how many kids the family said they'd set up,
// and whether the loop has fully completed. Drives the resume nudge after an abandon.
// ---------------------------------------------------------------------------
export interface SetupState extends Timestamped {
  declaredStudentCount?: number;
  setupComplete?: boolean;
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Timeline dismissals: per-student singleton (PK=TIMELINE_DISMISSALS). The master timeline is a
// derived stream (events are projected from colleges/visits/exams/goals…), so "deleting" a timeline
// item can't touch a row — instead we record the event ids the family has dismissed and filter them
// out of every read path. Lets them clear an overdue item they skipped (a missed visit) or decided
// against, without mutating the underlying source record.
// ---------------------------------------------------------------------------
export interface TimelineDismissals extends Timestamped {
  eventIds: string[];
}

// ---------------------------------------------------------------------------
// Document (PK: DOCUMENT#<documentId>, SK: DETAILS; collection GSI1PK=DOCUMENTS) — v2.1 F2.
// Metadata for a file stored in the private documents S3 bucket; bytes are never in DynamoDB.
// Visibility follows the family/private model (private = Keira only; AI sees all when she's caller).
// ---------------------------------------------------------------------------
export type DocumentCategory =
  | 'certificate'
  | 'essay'
  | 'application-doc'
  | 'recommendation'
  | 'transcript'
  | 'financial-aid'
  | 'visit-photo'
  | 'other';

/** Optional link to the entity a document belongs to; absent = lives only in the general vault. */
export interface DocumentLink {
  type: 'certification' | 'essay' | 'application' | 'contact' | 'college' | 'scholarship';
  id: string;
}

export interface Document extends Timestamped {
  documentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  s3Key: string; // server-generated; never client-supplied
  category: DocumentCategory;
  linkedEntity?: DocumentLink;
  visibility: Visibility;
  uploadedBy: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Opportunity (PK: OPPORTUNITY#<id>, SK: DETAILS; collection GSI1PK=OPPORTUNITIES) — v2.1 Module 18.
// Volunteer / shadowing / CNA / summer programs the family can pursue to build clinical hours. The
// app DISCOVERS these via web-grounded AI (like colleges/scholarships) and tracks the ones she picks.
// ---------------------------------------------------------------------------
// Major-agnostic opportunity types (the module is anchored to the student's path, not nursing). The
// AI discovery + page copy adapt to the major; these stay generic so any field fits.
export type OpportunityType =
  | 'volunteer'
  | 'shadowing'
  | 'internship'
  | 'training-program'
  | 'summer-program'
  | 'job'
  | 'club'
  | 'other';

export type OpportunityStatus =
  | 'discovered'
  | 'interested'
  | 'applied'
  | 'active'
  | 'completed'
  | 'dismissed';

export interface Opportunity extends Timestamped {
  opportunityId: string;
  name: string;
  organization?: string;
  type: OpportunityType;
  location?: string;
  distanceNote?: string;
  description?: string;
  eligibility?: string[];
  timeCommitment?: string;
  cost?: number;
  applicationUrl?: string;
  contact?: { name?: string; email?: string; phone?: string };
  applicationDeadline?: string;
  status: OpportunityStatus;
  linkedActivityId?: string;
  linkedClinicalId?: string;
  dataSources?: string[];
  addedBy?: 'ai-discovered' | 'manual';
}

/** One discovered opportunity (name required) — the result of a discovery run. */
export interface OpportunityCandidate {
  name: string;
  organization?: string;
  type?: OpportunityType;
  location?: string;
  distanceNote?: string;
  description?: string;
  eligibility?: string[];
  timeCommitment?: string;
  cost?: number;
  applicationUrl?: string;
  applicationDeadline?: string;
}

/**
 * Transient async opportunity-discovery job (mirrors DiscoveryJob). The API creates one and enqueues
 * it; the SQS worker runs the web-grounded search and writes candidates back; the frontend polls.
 * PK: OPPORTUNITY_DISCOVERY#<jobId>, SK: DETAILS.
 */
export interface OpportunityDiscoveryJob extends Timestamped {
  jobId: string;
  status: 'pending' | 'complete' | 'failed';
  filters?: { type?: OpportunityType; location?: string; query?: string; limit?: number };
  candidates?: OpportunityCandidate[];
  count?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Student profile (PK: STUDENT_PROFILE, SK: DETAILS) — global singleton. Keira's academic profile,
// captured by the first-run onboarding wizard (v2.1 F4). Distinct from the per-user account `Profile`
// (USER#<id>). All fields optional so the wizard can save incrementally. `onboardingComplete` gates
// whether the wizard reappears.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Financial aid item (PK: FINAID#<itemId>, SK: DETAILS; collection GSI1PK=FINAID) — v2.1 Module 19.
// FAFSA/CSS + per-school aid deadlines and award letters. Feeds the Master Timeline + reminder digest.
// ---------------------------------------------------------------------------
export type FinAidKind =
  | 'fafsa'
  | 'css-profile'
  | 'state-aid'
  | 'institutional-aid'
  | 'loan'
  | 'award-letter'
  | 'other';

export type FinAidStatus = 'not-started' | 'in-progress' | 'submitted' | 'received' | 'n/a';

export interface FinAidItem extends Timestamped {
  itemId: string;
  kind: FinAidKind;
  title: string;
  relatedCollegeId?: string;
  openDate?: string;
  deadline?: string;
  priorityDeadline?: string;
  status: FinAidStatus;
  amountOffered?: number;
  amountAccepted?: number;
  documentId?: string; // optional link to an uploaded award letter (v2.1 F2)
  notes?: string;
}

export interface StudentProfile extends Timestamped {
  name?: string;
  highSchool?: string;
  district?: string;
  location?: string;
  graduationYear?: number;
  currentGPA?: number;
  gpaType?: 'weighted' | 'unweighted';
  careerGoal?: string;
  /** The college major(s) the student is considering — a kid may be weighing more than one. Drives
   *  AI college matching/benchmarks and genericizes the app away from a hardcoded nursing/BSN focus.
   *  Empty/undefined → the AI and copy use a neutral "their intended program". */
  intendedMajors?: string[];
  dreamSchool?: string;
  interests?: string[];
  currentActivities?: { name: string; type?: string; organization?: string }[];
  budget?: { total?: number; currency?: 'USD'; notes?: string };
  onboardingComplete?: boolean;
  updatedBy?: string;
}

/** One web source the AI cited when generating the focus overview. */
export interface FocusSource {
  title: string;
  url: string;
}

/**
 * Cached AI overview of pursuing the active student's intended major (the "major pack" page). A
 * per-student singleton (PK=FOCUS_OVERVIEW): generating it is web-grounded and slow, so it's produced
 * by the async hydration worker and read back by GET /focus. `generatedFor` records the majors it was
 * written for, so the page can tell the user a refresh is due when they change their major.
 */
export interface FocusOverview extends Timestamped {
  status: 'pending' | 'complete' | 'failed';
  /** The intended major(s) this overview was generated for (so a major change marks it stale). */
  generatedFor: string[];
  /** Markdown prose overview of the major: what it involves, prerequisites, outlook, milestones. */
  overview?: string;
  sources?: FocusSource[];
  error?: string;
}
