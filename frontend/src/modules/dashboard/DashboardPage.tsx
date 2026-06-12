import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Icon, Spinner, cn } from '../../shared/ui';
import { categoryRows, deadlineLabel, deadlineTone, gpaText, money, READINESS_TONE, SOURCE_TONE, totalColleges } from './logic';
import { getDashboard } from './api';
import type { Dashboard } from './types';
import { getFocus } from '../focus/api';
import type { FocusResponse } from '../focus/types';

/** A banner linking to the Focus (major-pack) page — shown only once the student has set a major. It
 *  makes the otherwise-ambient major pack a visible, clickable destination from the dashboard. */
function FocusBanner() {
  const [focus, setFocus] = useState<FocusResponse | null>(null);
  useEffect(() => {
    getFocus().then(setFocus).catch(() => setFocus(null));
  }, []);
  if (!focus || focus.packs.length === 0) return null;
  return (
    <Link to="/focus" className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
      <Card className="flex items-center gap-3 border border-primary-200 bg-primary-50 transition hover:-translate-y-0.5 hover:shadow-md">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
          <Icon name="star" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary-800">Your focus: {focus.packs.map((p) => p.label).join(' + ')}</p>
          <p className="text-xs text-primary-700">Tailored exam, certifications, and prep — plus an AI overview of the path.</p>
        </div>
        <Icon name="chevron-right" size={18} className="text-primary-400 transition-transform group-hover:translate-x-0.5" />
      </Card>
    </Link>
  );
}

/** A dashboard card that navigates to its page on click (keyboard-accessible), with a hover affordance. */
function LinkCard({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
    >
      <Card className={cn('h-full cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary-200', className)}>
        {children}
      </Card>
    </Link>
  );
}

/** A heading for a clickable card — shows a chevron that nudges on hover to signal it's a link. */
function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-ink-800">
      <span>{children}</span>
      <Icon name="chevron-right" size={16} className="text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500" />
    </h2>
  );
}

/** A compact stat tile that links to its page. */
function Stat({ to, label, value, sub, icon }: { to: string; label: string; value: string; sub?: string; icon: 'course' | 'heart' | 'clinical' | 'teas' }) {
  return (
    <LinkCard to={to} className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-ink-500">{label}</p>
        <p className="text-xl font-bold text-ink-900">{value}</p>
        {sub ? <p className="text-xs text-ink-400">{sub}</p> : null}
      </div>
    </LinkCard>
  );
}

/** Whole-journey dashboard — role-specific, visibility-filtered (a parent never sees keira's private
 *  entries in any widget). */
export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getDashboard()
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your dashboard.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <div className="flex justify-center py-24"><Spinner size={28} /></div>;
  if (error || !d) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error ?? 'No data.'}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={load}>Retry</Button>
        </Card>
      </div>
    );
  }

  const empty = d.activity.totalCount === 0 && totalColleges(d.collegeCounts) === 0 && d.gpa.courses === 0;
  if (empty) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <EmptyState icon="home" title="Welcome to Campus Carousel" description="As you log activities, add colleges, and track your prep, this dashboard fills with your whole story at a glance." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-ink-500">Your whole journey, at a glance.</p>
      </header>

      <FocusBanner />

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat to="/courses" icon="course" label="GPA" value={gpaText(d.gpa.weighted, d.gpa.unweighted)} sub={`${d.gpa.courses} courses`} />
        <Stat to="/journal" icon="heart" label="Activity hours" value={String(d.activity.totalHours)} sub={d.activity.weeklyStreak > 0 ? `🔥 ${d.activity.weeklyStreak}-wk streak` : `${d.activity.totalCount} entries`} />
        <Stat to="/experience" icon="clinical" label="Experience hours" value={String(d.clinicalHours)} />
        <Stat to="/exams" icon="teas" label="Latest exam" value={d.latestExam ? String(d.latestExam.overallScore) : '—'} sub={d.latestExam?.date} />
      </div>

      {/* Student motivational / family financial band */}
      {d.student ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border border-primary-200 bg-primary-50">
          <p className="text-sm font-medium text-primary-800">{d.student.motivationalStat}</p>
          {d.student.interviewReadiness.avgRating !== null ? (
            <Link to="/interviews" className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300">
              <Badge tone="primary">Interview readiness {d.student.interviewReadiness.avgRating}/5</Badge>
            </Link>
          ) : null}
        </Card>
      ) : d.family ? (
        <Card className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link to="/finaid" className="rounded-lg p-1 transition hover:bg-surface-base"><p className="text-xs text-ink-500">Budget</p><p className="font-semibold text-ink-900">{money(d.family.budget.totalBudget)}</p></Link>
          <Link to="/scholarships" className="rounded-lg p-1 transition hover:bg-surface-base"><p className="text-xs text-ink-500">Scholarships won</p><p className="font-semibold text-ink-900">{money(d.family.budget.awarded)}</p></Link>
          <Link to="/goals" className="rounded-lg p-1 transition hover:bg-surface-base"><p className="text-xs text-ink-500">Goals</p><p className="font-semibold text-ink-900">{d.family.goals.completed}/{d.family.goals.total} done{d.family.goals.avgProgress !== null ? ` · ${d.family.goals.avgProgress}%` : ''}</p></Link>
          <Link to="/benchmark" className="rounded-lg p-1 transition hover:bg-surface-base"><p className="text-xs text-ink-500">Readiness</p><Badge tone={READINESS_TONE[d.family.benchmarkReadiness.level] ?? 'neutral'}>{d.family.benchmarkReadiness.level}</Badge></Link>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Upcoming deadlines → master timeline */}
        <LinkCard to="/timeline">
          <CardTitle>Upcoming deadlines</CardTitle>
          {d.upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-ink-500">No upcoming deadlines.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {d.upcomingDeadlines.map((dl, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <Badge tone={SOURCE_TONE[dl.source]}>{dl.source}</Badge>
                    <span className="truncate text-ink-800">{dl.label}</span>
                  </span>
                  <Badge tone={deadlineTone(dl.daysUntil)}>{deadlineLabel(dl)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </LinkCard>

        {/* Recent activity feed → journal */}
        <LinkCard to="/journal">
          <CardTitle>Recent activity</CardTitle>
          {d.recentFeed.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing logged yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.recentFeed.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink-800">{f.title}</span>
                  <span className="shrink-0 text-xs text-ink-400">{f.category} · {f.date.slice(5)}</span>
                </li>
              ))}
            </ul>
          )}
        </LinkCard>

        {/* Colleges → college hub */}
        <LinkCard to="/colleges">
          <CardTitle>Colleges ({totalColleges(d.collegeCounts)})</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(d.collegeCounts).map(([status, n]) => (
              <Badge key={status} tone="neutral">{status}: {n}</Badge>
            ))}
            {totalColleges(d.collegeCounts) === 0 ? <p className="text-sm text-ink-500">No colleges tracked.</p> : null}
          </div>
        </LinkCard>

        {/* Hours by category → journal */}
        <LinkCard to="/journal">
          <CardTitle>Hours by category</CardTitle>
          {categoryRows(d.activity.hoursByCategory).length === 0 ? (
            <p className="text-sm text-ink-500">No hours logged yet.</p>
          ) : (
            <ul className="space-y-0.5 text-sm text-ink-700">
              {categoryRows(d.activity.hoursByCategory).map((r) => (
                <li key={r.category} className="flex justify-between"><span>{r.category}</span><span>{r.hours}h</span></li>
              ))}
            </ul>
          )}
        </LinkCard>

        {/* Certifications → certifications */}
        <LinkCard to="/certifications">
          <CardTitle>Certifications</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {d.certifications.active > 0 ? <Badge tone="success">{d.certifications.active} active</Badge> : null}
            {d.certifications.expiringSoon > 0 ? <Badge tone="warn">{d.certifications.expiringSoon} expiring</Badge> : null}
            {d.certifications.expired > 0 ? <Badge tone="error">{d.certifications.expired} expired</Badge> : null}
            {d.certifications.planned > 0 ? <Badge tone="neutral">{d.certifications.planned} planned</Badge> : null}
            {d.certifications.active + d.certifications.expiringSoon + d.certifications.expired + d.certifications.planned === 0 ? <span className="text-sm text-ink-400">none</span> : null}
          </div>
        </LinkCard>
      </div>
    </div>
  );
}
