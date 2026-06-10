// Domain types for every entity in the single-table data model.
// Source of truth: spec/keirasjourney-spec.md → "Data Model". These are the shapes the
// data-access library returns to callers (internal PK/SK/GSI attributes are stripped).
//
// Visibility is a DOMAIN field here, but filtering by it is NOT done in this library — it
// is enforced in the API/auth layer off the caller's JWT (see specs/foundational/auth.md),
// because the AI path needs unfiltered access when keira is the caller. The lib returns raw.

export type Visibility = 'family' | 'private';
export type Role = 'admin' | 'parent' | 'student';

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
    | 'direct-admit-BSN'
    | 'pre-nursing-secondary-app'
    | 'ABSN-only'
    | 'RN-to-BSN-only';
  isDirectAdmit?: boolean;
  hasBSN?: boolean;
  hasAcceleratedBSN?: boolean;
  isTopPick?: boolean;
  ranking?: string;
  /** AI narrative (2-3 paragraphs): what makes this school/program distinctive + who it fits. */
  overview?: string;
  /** AI narrative (1-2 paragraphs): exactly how a student gets in — pathways, timeline, selectivity. */
  admissionsDeepDive?: string;
  nclexPassRate?: string;
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
  acceptanceRateNursing?: string;
  acceptanceRateUniversity?: string;
  avgGPAAdmitted?: string;
  prerequisites?: string[];
  applicationDeadlines?: { earlyAction?: string; regularDecision?: string; nursingApp?: string };
  essayPrompts?: string[];
  requiredTests?: string[];
  clinicalPartners?: string[];
  /** Authentic student voices, each with a source URL for verification. */
  testimonials?: { quote: string; attribution?: string; source?: string }[];
  /** URLs to campus/program photos for the branded header gallery. */
  campusImageUrls?: string[];
  specialNotes?: string;
  website?: string;
  /** URLs the AI relied on during the most recent hydration (shown as "Sources"). */
  dataSources?: string[];
  /** Academic year the hydrated figures reflect, e.g. "2025-2026". */
  dataAsOf?: string;
  branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; mascot?: string };
  contactInfo?: {
    nursingAdmissionsPhone?: string;
    nursingAdmissionsEmail?: string;
    nursingAdmissionsUrl?: string;
    financialAidPhone?: string;
    financialAidUrl?: string;
    campusVisitUrl?: string;
  };
  status?: CollegeStatus;
  fitScore?: number;
}

/** One discovered candidate (College-shaped, name required) — the result of a discovery run. */
export interface DiscoveredCollege {
  name: string;
  location?: string;
  state?: string;
  programType?: College['programType'];
  isDirectAdmit?: boolean;
  hasBSN?: boolean;
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
  visitType?: 'campus-tour' | 'nursing-dept-visit' | 'open-house' | 'admitted-student-day' | 'overnight' | 'virtual';
  attendees?: string[];
  questionsToAsk?: { question: string; answer?: string; askedTo?: string }[];
  impressions?: string;
  pros?: string[];
  cons?: string[];
  photos?: string[];
  wouldAttend?: 'yes' | 'no' | 'maybe' | 'undecided';
  travelCost?: number;
  createdBy?: string;
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
    | 'nursing-specific'
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
// Clinical hours (PK: CLINICAL#<id>, SK: DETAILS) — GSI3 facility
// ---------------------------------------------------------------------------
export interface Clinical extends Timestamped {
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

// ---------------------------------------------------------------------------
// TEAS record (PK: TEAS#<id>, SK: DETAILS) — GSI4 date
// ---------------------------------------------------------------------------
export interface Teas extends Timestamped {
  recordId: string;
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
// Why Nursing (PK: WHYNURSING#<id>, SK: DETAILS)
// ---------------------------------------------------------------------------
export interface WhyNursing extends Timestamped {
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
  relationship?: 'mentor' | 'supervisor' | 'teacher' | 'admissions' | 'nurse' | 'recommender' | 'other';
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
