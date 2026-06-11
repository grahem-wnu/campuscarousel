// Frontend types for the Dashboard — mirror the GET /dashboard payload (role-specific).

export type Role = 'admin' | 'parent' | 'student' | 'member';

export interface Gpa {
  weighted: number | null;
  unweighted: number | null;
  courses: number;
}
export interface ActivitySummary {
  totalCount: number;
  totalHours: number;
  hoursByCategory: Record<string, number>;
  weeklyStreak: number;
}
export interface CertSummary {
  active: number;
  expiringSoon: number;
  expired: number;
  planned: number;
}
export interface Deadline {
  source: 'college' | 'goal' | 'scholarship' | 'certification';
  label: string;
  date: string;
  daysUntil: number;
}
export interface FeedItem {
  date: string;
  title: string;
  category: string;
}
export interface StudentSection {
  weeklyStreak: number;
  nextMilestone: Deadline | null;
  motivationalStat: string;
  interviewReadiness: { avgRating: number | null; answered: number };
}
export interface FamilySection {
  budget: {
    totalBudget: number | null;
    awarded: number;
    scholarshipsApplied: number;
    scholarshipsAwarded: number;
    topPickNetCost: number | null;
  };
  goals: { total: number; completed: number; inProgress: number; avgProgress: number | null };
  benchmarkReadiness: {
    level: 'strong' | 'competitive' | 'needs-work' | 'insufficient-data';
    gpa: number | null;
    exam: number | null;
    clinicalHours: number;
  };
}

export interface Dashboard {
  role: Role;
  gpa: Gpa;
  activity: ActivitySummary;
  clinicalHours: number;
  latestExam: { date: string; overallScore: number } | null;
  certifications: CertSummary;
  upcomingDeadlines: Deadline[];
  collegeCounts: Record<string, number>;
  recentFeed: FeedItem[];
  student?: StudentSection;
  family?: FamilySection;
}
