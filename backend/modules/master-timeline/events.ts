// Pure timeline aggregation — turns dated items from many modules into one unified, sortable event
// stream. Framework- and AWS-free so it unit-tests for real. Visibility filtering is the CALLER's
// job (the handler runs activities through filterForRequester before calling buildEvents), so a
// private activity never becomes a parent-visible event. Date math takes `todayIso` explicitly.

import type {
  Activity,
  Certification,
  College,
  FinAidItem,
  Goal,
  Scholarship,
  ExamScore,
  Visit,
} from '../../shared/data/index.js';
import { collegeDeadlineDate } from '../../shared/college-deadline.js';

export const EVENT_SOURCES = ['activity', 'goal', 'college', 'exam', 'visit', 'scholarship', 'certification', 'finaid'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export interface TimelineEvent {
  id: string;
  date: string;
  source: EventSource;
  /** Sub-type label within the source (e.g. 'regular-decision', 'official-exam', category). */
  type: string;
  title: string;
  /** The owning record id + (for sub-entities) college, so the UI can deep-link to the module. */
  refId?: string;
  collegeId?: string;
  /** College logo (college-sourced events only) so the UI can show which school a deadline is for. */
  logoUrl?: string;
}

const MS_PER_DAY = 86_400_000;
export function daysUntil(dateIso: string, todayIso: string): number | null {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  const base = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(base)) return null;
  return Math.round((t - base) / MS_PER_DAY);
}

export interface EventSources {
  activities: readonly Activity[]; // already visibility-filtered by the caller
  goals: readonly Goal[];
  colleges: readonly College[];
  exams: readonly ExamScore[];
  visits: readonly Visit[];
  scholarships: readonly Scholarship[];
  certifications: readonly Certification[];
  /** Financial-aid items (v2.1 Module 19). Optional so existing callers need no change. */
  finaid?: readonly FinAidItem[];
  /** The student's graduation year — projects college application deadlines onto their senior-year
   *  cycle (so an underclassman's deadlines aren't dated to the current, already-past cycle). */
  graduationYear?: number;
}

/** Build the unified, date-ascending event stream from all sources. */
export function buildEvents(s: EventSources): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const push = (e: Omit<TimelineEvent, 'id'> & { id?: string }) => {
    if (!e.date) return;
    out.push({ id: e.id ?? `${e.source}:${e.refId ?? e.title}:${e.date}`, ...e });
  };

  for (const a of s.activities) push({ source: 'activity', type: a.category, title: a.title, date: a.date, refId: a.activityId });
  for (const g of s.goals) if (g.status !== 'completed' && g.status !== 'dropped' && g.targetDate) push({ source: 'goal', type: 'deadline', title: g.title, date: g.targetDate, refId: g.goalId });
  for (const c of s.colleges) {
    if (c.status === 'removed') continue;
    const d = c.applicationDeadlines;
    const logoUrl = c.branding?.logoUrl;
    if (d?.earlyAction) push({ source: 'college', type: 'early-action', title: `${c.name} — early action`, date: collegeDeadlineDate(d.earlyAction, s.graduationYear), refId: c.collegeId, collegeId: c.collegeId, logoUrl });
    if (d?.regularDecision) push({ source: 'college', type: 'regular-decision', title: `${c.name} — regular decision`, date: collegeDeadlineDate(d.regularDecision, s.graduationYear), refId: c.collegeId, collegeId: c.collegeId, logoUrl });
    if (d?.programApp) push({ source: 'college', type: 'program-app', title: `${c.name} — program app`, date: collegeDeadlineDate(d.programApp, s.graduationYear), refId: c.collegeId, collegeId: c.collegeId, logoUrl });
  }
  for (const t of s.exams) if (t.type === 'official-exam') push({ source: 'exam', type: 'official-exam', title: 'Official exam', date: t.date, refId: t.recordId });
  for (const v of s.visits) push({ source: 'visit', type: v.visitType ?? 'visit', title: `Campus visit${v.visitType ? ` — ${v.visitType}` : ''}`, date: v.date, refId: v.visitId, collegeId: v.collegeId });
  for (const sc of s.scholarships) if (!['awarded', 'denied', 'expired'].includes(sc.status ?? '') && sc.applicationDeadline) push({ source: 'scholarship', type: 'deadline', title: sc.name, date: sc.applicationDeadline, refId: sc.scholarshipId });
  for (const c of s.certifications) if (c.renewalRequired && c.expirationDate) push({ source: 'certification', type: 'expiration', title: `${c.name} renewal`, date: c.expirationDate, refId: c.certId });
  for (const f of s.finaid ?? []) if (f.deadline && f.status !== 'n/a') push({ source: 'finaid', type: f.kind, title: f.title, date: f.deadline, refId: f.itemId, collegeId: f.relatedCollegeId });

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source.localeCompare(b.source)));
}

export interface EventFilters {
  from?: string;
  to?: string;
  source?: EventSource;
  type?: string;
}
export function filterEvents(events: readonly TimelineEvent[], f: EventFilters): TimelineEvent[] {
  return events.filter((e) => {
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    if (f.source && e.source !== f.source) return false;
    if (f.type && e.type !== f.type) return false;
    return true;
  });
}

export type UpcomingGroup = 'overdue' | 'this-week' | 'next-week' | 'this-month' | 'later';
export interface UpcomingEvent extends TimelineEvent {
  daysUntil: number;
  group: UpcomingGroup;
}

function groupOf(days: number): UpcomingGroup {
  if (days < 0) return 'overdue';
  if (days <= 7) return 'this-week';
  if (days <= 14) return 'next-week';
  if (days <= 30) return 'this-month';
  return 'later';
}

/**
 * Events within `horizonDays` of today (default 90), PLUS overdue ones — overdue first, then soonest.
 * Each carries a daysUntil + bucket so the UI can group "this week / next week / this month / later".
 */
export function upcoming(events: readonly TimelineEvent[], todayIso: string, horizonDays = 90): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];
  for (const e of events) {
    const d = daysUntil(e.date, todayIso);
    if (d === null || d > horizonDays) continue;
    out.push({ ...e, daysUntil: d, group: groupOf(d) });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}
