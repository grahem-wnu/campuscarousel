import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Icon, Spinner } from '../../shared/ui';
import { categoryRows, deadlineLabel, deadlineTone, gpaText, money, READINESS_TONE, SOURCE_TONE, totalColleges } from './logic';
import { getDashboard } from './api';
import type { Dashboard } from './types';

/** A compact stat tile. */
function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: 'course' | 'heart' | 'clinical' | 'teas' }) {
  return (
    <Card className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-ink-500">{label}</p>
        <p className="text-xl font-bold text-ink-900">{value}</p>
        {sub ? <p className="text-xs text-ink-400">{sub}</p> : null}
      </div>
    </Card>
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
        <EmptyState icon="home" title="Welcome to Keira’s Journey" description="As you log activities, add colleges, and track your prep, this dashboard fills with your whole story at a glance." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-ink-500">Your whole journey, at a glance.</p>
      </header>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="course" label="GPA" value={gpaText(d.gpa.weighted, d.gpa.unweighted)} sub={`${d.gpa.courses} courses`} />
        <Stat icon="heart" label="Activity hours" value={String(d.activity.totalHours)} sub={d.activity.weeklyStreak > 0 ? `🔥 ${d.activity.weeklyStreak}-wk streak` : `${d.activity.totalCount} entries`} />
        <Stat icon="clinical" label="Experience hours" value={String(d.clinicalHours)} />
        <Stat icon="teas" label="Latest exam" value={d.latestExam ? String(d.latestExam.overallScore) : '—'} sub={d.latestExam?.date} />
      </div>

      {/* Student motivational / family financial band */}
      {d.student ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border border-primary-200 bg-primary-50">
          <p className="text-sm font-medium text-primary-800">{d.student.motivationalStat}</p>
          {d.student.interviewReadiness.avgRating !== null ? (
            <Badge tone="primary">Interview readiness {d.student.interviewReadiness.avgRating}/5</Badge>
          ) : null}
        </Card>
      ) : d.family ? (
        <Card className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><p className="text-xs text-ink-500">Budget</p><p className="font-semibold text-ink-900">{money(d.family.budget.totalBudget)}</p></div>
          <div><p className="text-xs text-ink-500">Scholarships won</p><p className="font-semibold text-ink-900">{money(d.family.budget.awarded)}</p></div>
          <div><p className="text-xs text-ink-500">Goals</p><p className="font-semibold text-ink-900">{d.family.goals.completed}/{d.family.goals.total} done{d.family.goals.avgProgress !== null ? ` · ${d.family.goals.avgProgress}%` : ''}</p></div>
          <div><p className="text-xs text-ink-500">Readiness</p><Badge tone={READINESS_TONE[d.family.benchmarkReadiness.level] ?? 'neutral'}>{d.family.benchmarkReadiness.level}</Badge></div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Upcoming deadlines */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Upcoming deadlines</h2>
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
        </Card>

        {/* Recent activity feed */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Recent activity</h2>
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
        </Card>

        {/* Colleges */}
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Colleges ({totalColleges(d.collegeCounts)})</h2>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(d.collegeCounts).map(([status, n]) => (
              <Badge key={status} tone="neutral">{status}: {n}</Badge>
            ))}
            {totalColleges(d.collegeCounts) === 0 ? <p className="text-sm text-ink-500">No colleges tracked.</p> : null}
          </div>
        </Card>

        {/* Activity by category + certifications */}
        <Card className="space-y-3">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink-800">Hours by category</h2>
            {categoryRows(d.activity.hoursByCategory).length === 0 ? (
              <p className="text-sm text-ink-500">No hours logged yet.</p>
            ) : (
              <ul className="space-y-0.5 text-sm text-ink-700">
                {categoryRows(d.activity.hoursByCategory).map((r) => (
                  <li key={r.category} className="flex justify-between"><span>{r.category}</span><span>{r.hours}h</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-surface-border pt-2">
            <span className="text-sm text-ink-500">Certs:</span>
            {d.certifications.active > 0 ? <Badge tone="success">{d.certifications.active} active</Badge> : null}
            {d.certifications.expiringSoon > 0 ? <Badge tone="warn">{d.certifications.expiringSoon} expiring</Badge> : null}
            {d.certifications.expired > 0 ? <Badge tone="error">{d.certifications.expired} expired</Badge> : null}
            {d.certifications.planned > 0 ? <Badge tone="neutral">{d.certifications.planned} planned</Badge> : null}
            {d.certifications.active + d.certifications.expiringSoon + d.certifications.expired + d.certifications.planned === 0 ? <span className="text-sm text-ink-400">none</span> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
