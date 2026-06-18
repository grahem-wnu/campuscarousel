import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Icon, Spinner, cn } from '../../shared/ui';
import { deadlineLabel, deadlineTone, gpaText, money, READINESS_TONE, SOURCE_ICON, SOURCE_TONE, totalColleges } from './logic';
import { getDashboard } from './api';
import type { Dashboard } from './types';
import { getFocus } from '../focus/api';
import type { FocusResponse } from '../focus/types';
import { getProfile, type StudentProfile } from '../onboarding/api';
import { listColleges } from '../college-hub/api';
import type { College } from '../college-hub/types';

/** How many colleges the dashboard card lists before collapsing the rest into "+N more". */
const COLLEGE_PREVIEW = 6;

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

/** A small pill link used for the "what to do next" row in the setup banner. */
function NextStep({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-white px-3 py-1 text-xs font-medium text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
    >
      {children}
      <Icon name="chevron-right" size={12} />
    </Link>
  );
}

/**
 * Post-onboarding orientation. After setup the app silently seeds ~12 colleges and researches each
 * one in the background (tuition, deadlines, fit) — which left families unsure what was happening or
 * what to do next. This banner narrates that work: it appears right after onboarding (the
 * `onboarding-finished` event) and any time colleges are actively hydrating, shows live progress
 * while polling, flips to an "all set" state when research finishes, and points to the next steps.
 * It self-hides when there's nothing to report, and is dismissible.
 */
// ~2 minutes at the 4s poll cadence: how long we'll wait for the async seed to produce colleges
// before giving up, so a seed that never lands doesn't poll for the whole session.
const SEED_WAIT_MAX_POLLS = 30;

export function SetupProgressBanner() {
  const [colleges, setColleges] = useState<College[] | null>(null);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Onboarding finish enqueues seeding server-side and returns immediately, so the colleges don't
  // exist yet when we first refetch. This flag keeps us polling through that gap (finish → seed job
  // creates colleges) — without it the banner only polls once research is already in flight, so the
  // seeded colleges were never discovered until a navigation remounted the banner.
  const [waitingForSeed, setWaitingForSeed] = useState(false);

  const refresh = useCallback(() => {
    listColleges()
      .then(setColleges)
      .catch(() => {
        /* best-effort — the banner just won't show if we can't read the list */
      });
  }, []);

  useEffect(refresh, [refresh]);

  // When onboarding finishes, frame this as a welcome and start watching for the seeded colleges.
  useEffect(() => {
    const onFinished = () => {
      setJustOnboarded(true);
      setDismissed(false);
      setWaitingForSeed(true);
      refresh();
    };
    window.addEventListener('onboarding-finished', onFinished);
    return () => window.removeEventListener('onboarding-finished', onFinished);
  }, [refresh]);

  const total = colleges ? colleges.length : 0;
  const researching = colleges
    ? colleges.filter((c) => c.hydrationStatus === 'in-progress' || c.hydrationStatus === 'pending').length
    : 0;

  // Once the seeded colleges show up, we're no longer waiting for the seed to land.
  useEffect(() => {
    if (waitingForSeed && total > 0) setWaitingForSeed(false);
  }, [waitingForSeed, total]);

  // Poll while seeding is pending (just onboarded, colleges not created yet) OR research is in flight,
  // so the banner updates on its own — no navigation/remount needed. Bounded so a seed that never
  // produces colleges doesn't poll forever.
  const shouldPoll = researching > 0 || waitingForSeed;
  useEffect(() => {
    if (!shouldPoll) return;
    let polls = 0;
    const id = window.setInterval(() => {
      polls += 1;
      refresh();
      if (polls >= SEED_WAIT_MAX_POLLS) setWaitingForSeed(false);
    }, 4000);
    return () => window.clearInterval(id);
  }, [shouldPoll, refresh]);

  if (dismissed || !colleges) return null;
  const done = total - researching;
  const active = researching > 0;
  // Seeded colleges haven't appeared yet — show a "setting up" state instead of a misleading "all set".
  const seeding = waitingForSeed && total === 0;
  // Nothing timely to say: not freshly onboarded, nothing seeding, no research running.
  if (!active && !seeding && !justOnboarded) return null;

  return (
    <Card className="relative border border-primary-200 bg-primary-50">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-primary-400 transition hover:text-primary-600"
      >
        <Icon name="close" size={16} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
          {active || seeding ? <Spinner size={18} /> : <Icon name="check" size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          {seeding ? (
            <>
              <p className="text-sm font-semibold text-primary-800">You&rsquo;re all set — setting up your plan</p>
              <p className="mt-0.5 text-xs text-primary-700">
                We&rsquo;re creating your goals and colleges and researching each one. This fills in on its
                own — keep exploring.
              </p>
            </>
          ) : active ? (
            <>
              <p className="text-sm font-semibold text-primary-800">
                {justOnboarded ? "You're all set — we're researching your colleges" : 'Researching your colleges'}
              </p>
              <p className="mt-0.5 text-xs text-primary-700">
                {done} of {total} ready. We&rsquo;re pulling tuition, deadlines, and fit in the background — keep
                exploring, this updates on its own.
              </p>
              {total > 0 ? (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary-100">
                  <div
                    className="h-full rounded-full bg-primary-500 transition-all"
                    style={{ width: `${Math.round((done / total) * 100)}%` }}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-primary-800">
                You&rsquo;re all set{total > 0 ? ` — ${total} colleges researched` : ''}
              </p>
              <p className="mt-0.5 text-xs text-primary-700">Here&rsquo;s where to pick up next.</p>
            </>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <NextStep to="/focus">See your focus</NextStep>
            <NextStep to="/colleges">Browse colleges</NextStep>
            <NextStep to="/timeline">View your timeline</NextStep>
          </div>
        </div>
      </div>
    </Card>
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

/** A first-run quick-start tile: icon + title + one-line body, links into a module. */
function StartCard({ to, icon, title, body }: { to: string; icon: 'star' | 'school' | 'heart' | 'course'; title: string; body: string }) {
  return (
    <LinkCard to={to} className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-semibold text-ink-800">
          {title}
          <Icon name="chevron-right" size={14} className="text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500" />
        </p>
        <p className="mt-0.5 text-xs text-ink-500">{body}</p>
      </div>
    </LinkCard>
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
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [colleges, setColleges] = useState<College[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getDashboard()
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your dashboard.'))
      .finally(() => setLoading(false));
    // Profile decides empty-state vs the real dashboard, and supplies the self-reported GPA. Non-blocking.
    getProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
    // The colleges card lists the actual schools (names + status), not just per-status counts.
    // Non-blocking — the card falls back to a spinner until this resolves.
    listColleges()
      .then(setColleges)
      .catch(() => setColleges(null));
  };
  useEffect(load, []);

  // After conversational onboarding finishes, refetch so the seeded dashboard shows immediately.
  useEffect(() => {
    window.addEventListener('onboarding-finished', load);
    return () => window.removeEventListener('onboarding-finished', load);
  }, []);

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

  // Guided first-run only until setup is done; once onboarded, show the real dashboard (blank tiles
  // that invite a click) even before any data is logged.
  const onboarded = profile?.onboardingComplete === true;
  const empty = d.activity.totalCount === 0 && totalColleges(d.collegeCounts) === 0 && d.gpa.courses === 0;
  if (empty && !onboarded) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header>
          <h1 className="text-2xl font-bold text-ink-900">Let&rsquo;s get started</h1>
          <p className="mt-1 text-sm text-ink-500">
            Nothing here yet. Run the quick setup, or jump into any one of these — your dashboard fills in as you go.
          </p>
        </header>

        {/* Primary path: build the profile via the setup wizard (dispatched to the shell's OnboardingGate). */}
        <Card className="flex flex-wrap items-center justify-between gap-3 border border-primary-200 bg-primary-50">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-800">Build the profile</p>
            <p className="text-xs text-primary-700">A few basics — major, career goal, GPA — power the AI, benchmarks, and your whole dashboard.</p>
          </div>
          <Button onClick={() => window.dispatchEvent(new Event('open-onboarding'))}>Set up the profile</Button>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StartCard to="/family" icon="star" title="Set the academic focus" body="Pick an intended major and career goal — this personalizes everything." />
          <StartCard to="/colleges" icon="school" title="Add your first college" body="Search programs and pull tuition, deadlines, and rankings." />
          <StartCard to="/journal" icon="heart" title="Log an activity" body="Track clubs, volunteering, and clinical hours." />
          <StartCard to="/courses" icon="course" title="Add your courses" body="Enter classes to track GPA over time." />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
        <p className="mt-0.5 text-sm text-ink-500">Your whole journey, at a glance.</p>
      </header>

      <SetupProgressBanner />

      <FocusBanner />

      {/* Headline stats. GPA prefers entered courses; before any courses, falls back to the
          self-reported GPA from onboarding so it isn't blank. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          to="/courses"
          icon="course"
          label="GPA"
          value={d.gpa.courses > 0 ? gpaText(d.gpa.weighted, d.gpa.unweighted) : profile?.currentGPA != null ? profile.currentGPA.toFixed(2) : '—'}
          sub={d.gpa.courses > 0 ? `${d.gpa.courses} courses` : profile?.currentGPA != null ? 'self-reported' : '0 courses'}
        />
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
          {/* Budget + Scholarships won are read-only stats, not links — they used to navigate to FinAid,
              which was surprising for a glanceable figure. */}
          <div className="p-1"><p className="text-xs text-ink-500">Budget</p><p className="font-semibold text-ink-900">{money(d.family.budget.totalBudget)}</p></div>
          <div className="p-1"><p className="text-xs text-ink-500">Scholarships won</p><p className="font-semibold text-ink-900">{money(d.family.budget.awarded)}</p></div>
          <Link to="/goals" className="rounded-lg p-1 transition hover:bg-surface-base"><p className="text-xs text-ink-500">Goals</p><p className="font-semibold text-ink-900">{d.family.goals.completed}/{d.family.goals.total} done{d.family.goals.avgProgress !== null ? ` · ${d.family.goals.avgProgress}%` : ''}</p></Link>
          <Link to="/benchmark" className="rounded-lg p-1 transition hover:bg-surface-base"><p className="text-xs text-ink-500">Readiness</p><Badge tone={READINESS_TONE[d.family.benchmarkReadiness.level] ?? 'neutral'}>{d.family.benchmarkReadiness.level}</Badge></Link>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Colleges → college hub (tracked count). Above deadlines: the list drives the deadlines. */}
        <LinkCard to="/colleges">
          <CardTitle>Colleges ({totalColleges(d.collegeCounts)})</CardTitle>
          {totalColleges(d.collegeCounts) === 0 ? (
            <p className="text-sm text-ink-500">No colleges tracked.</p>
          ) : colleges === null ? (
            <div className="flex items-center gap-2 text-sm text-ink-400"><Spinner size={14} /> Loading…</div>
          ) : (
            <ul className="space-y-1">
              {[...colleges]
                // Top picks first, then alphabetical — a stable, scannable preview.
                .sort((a, b) => Number(b.isTopPick ?? false) - Number(a.isTopPick ?? false) || a.name.localeCompare(b.name))
                .slice(0, COLLEGE_PREVIEW)
                .map((c) => {
                  const hydrating = c.hydrationStatus === 'in-progress' || c.hydrationStatus === 'pending';
                  return (
                    <li key={c.collegeId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {c.isTopPick ? <Icon name="star" size={13} className="shrink-0 text-secondary-500" /> : null}
                        <span className="truncate text-ink-800">{c.name}</span>
                      </span>
                      {hydrating ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-ink-400"><Spinner size={11} /> researching</span>
                      ) : (
                        <span className="shrink-0 text-xs capitalize text-ink-400">{c.status ?? ''}</span>
                      )}
                    </li>
                  );
                })}
              {colleges.length > COLLEGE_PREVIEW ? (
                <li className="pt-0.5 text-xs font-medium text-primary-600">+{colleges.length - COLLEGE_PREVIEW} more →</li>
              ) : null}
            </ul>
          )}
        </LinkCard>

        {/* Upcoming deadlines → master timeline. A clean preview (next 3); the full list lives on the timeline. */}
        <LinkCard to="/timeline">
          <CardTitle>Upcoming deadlines</CardTitle>
          {d.upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing dated yet — add colleges, scholarships, goals, or certifications and their deadlines appear here automatically.</p>
          ) : (
            <>
              <ul className="divide-y divide-surface-border">
                {d.upcomingDeadlines.slice(0, 3).map((dl, i) => (
                  <li key={i} className="flex items-center gap-2.5 py-2">
                    {/* Compact type indicator (icon, not a wide text tag) — disambiguates when
                        deadlines come from different sources (colleges, scholarships, goals, certs). */}
                    <Badge tone={SOURCE_TONE[dl.source]} className="shrink-0">
                      <Icon name={SOURCE_ICON[dl.source]} size={13} />
                      <span className="sr-only">{dl.source}</span>
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800" title={dl.label}>{dl.label}</span>
                    <Badge tone={deadlineTone(dl.daysUntil)} className="shrink-0 whitespace-nowrap">{deadlineLabel(dl)}</Badge>
                  </li>
                ))}
              </ul>
              {d.upcomingDeadlines.length > 3 ? (
                <p className="mt-2 text-xs font-medium text-primary-600">+{d.upcomingDeadlines.length - 3} more on your timeline →</p>
              ) : null}
            </>
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
