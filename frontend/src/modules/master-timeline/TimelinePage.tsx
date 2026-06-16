import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Icon, Modal, Spinner, Tabs, type TabItem } from '../../shared/ui';
import { analyzeTimeline, getTimeline, getUpcoming } from './api';
import {
  GROUP_LABEL,
  SOURCE_DOT,
  SOURCE_LABEL,
  countdownLabel,
  eventsByDate,
  groupUpcoming,
  monthGrid,
  monthLabel,
} from './logic';
import type { Analysis, TimelineEvent, UpcomingEvent } from './types';
import { clearbitLogoFromWebsite, faviconFromWebsite } from '../college-hub/logic';

type TabId = 'upcoming' | 'calendar';
const nowDate = new Date();

/** Leading icon for an upcoming event: a best-effort college logo (the hydrated URL, then a Clearbit
 *  hotlink from the website), falling back to a school glyph (college) or the source-colored dot.
 *  Advances through the logo candidates on load error, so a broken URL never shows as broken. */
function EventIcon({ e }: { e: UpcomingEvent }) {
  const candidates = [e.logoUrl, clearbitLogoFromWebsite(e.website), faviconFromWebsite(e.website)].filter(
    (u): u is string => !!u,
  );
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="mt-0.5 h-6 w-6 shrink-0 rounded bg-white object-contain"
        onError={() => setIdx((i) => i + 1)}
      />
    );
  }
  if (e.source === 'college') {
    return (
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary-50 text-primary-600">
        <Icon name="school" size={14} />
      </span>
    );
  }
  return <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${SOURCE_DOT[e.source]}`} aria-hidden />;
}

/** A "where dated items come from" link in the empty-state guide. */
function TimelineSource({
  to,
  icon,
  label,
  hint,
}: {
  to: string;
  icon: 'school' | 'teas' | 'calendar' | 'scholarship' | 'application' | 'goal';
  label: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-2 rounded-lg border border-surface-border px-3 py-2 transition hover:border-primary-200 hover:bg-surface-sunken"
    >
      <span className="mt-0.5 text-primary-600"><Icon name={icon} size={16} /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-medium text-ink-800 group-hover:text-primary-700">
          {label}
          <Icon name="chevron-right" size={12} className="text-ink-300 group-hover:text-primary-500" />
        </span>
        <span className="block text-xs text-ink-400">{hint}</span>
      </span>
    </Link>
  );
}

/** Master Timeline — one unified calendar across every module: upcoming (prioritized) + a month
 *  calendar color-coded by source, plus AI focus/conflict analysis. */
export default function TimelinePage() {
  const [tab, setTab] = useState<TabId>('upcoming');
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [all, setAll] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [calYear, setCalYear] = useState(nowDate.getFullYear());
  const [calMonth, setCalMonth] = useState(nowDate.getMonth());

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Wide horizon (~5 yrs): an underclassman's application deadlines are 1–3 years out, so a 90-day
      // window would show nothing. Grouping ('Later') keeps near-term items on top.
      const [up, ev] = await Promise.all([getUpcoming(1825), getTimeline()]);
      setUpcoming(up);
      setAll(ev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your timeline.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const grouped = useMemo(() => groupUpcoming(upcoming), [upcoming]);
  const byDate = useMemo(() => eventsByDate(all), [all]);
  const grid = useMemo(() => monthGrid(calYear, calMonth), [calYear, calMonth]);

  async function runAnalyze() {
    setShowAnalysis(true);
    setAnalyzing(true);
    try {
      setAnalysis(await analyzeTimeline(90));
    } catch {
      setAnalysis(null);
    } finally {
      setAnalyzing(false);
    }
  }
  function stepMonth(delta: number) {
    const d = new Date(Date.UTC(calYear, calMonth + delta, 1));
    setCalYear(d.getUTCFullYear());
    setCalMonth(d.getUTCMonth());
  }

  const tabs: TabItem[] = [
    { id: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { id: 'calendar', label: 'Calendar' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Timeline</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every deadline, exam, visit, goal, and renewal across the app — collected here automatically.</p>
        </div>
        <Button variant="outline" icon="chat" onClick={() => void runAnalyze()}>What should I focus on?</Button>
      </header>

      <Tabs items={tabs} value={tab} onChange={(t) => setTab(t as TabId)} />

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : all.length === 0 ? (
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <Icon name="calendar" size={20} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink-800">Nothing dated yet</h2>
              <p className="mt-0.5 text-sm text-ink-500">
                You don’t add things here directly — this calendar fills itself from dated items across the app.
                Add any of these and they’ll show up automatically:
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TimelineSource to="/colleges" icon="school" label="Add a college" hint="Application deadlines appear once it finishes refreshing." />
            <TimelineSource to="/exams" icon="teas" label="Add an exam date" hint="Official test dates land on the calendar." />
            <TimelineSource to="/visits" icon="calendar" label="Plan a campus visit" hint="Visit dates show here too." />
            <TimelineSource to="/finaid" icon="application" label="Add a financial-aid item" hint="FAFSA/CSS and aid deadlines." />
            <TimelineSource to="/goals" icon="goal" label="Set a goal" hint="Goals with a target date appear." />
          </div>
        </Card>
      ) : tab === 'upcoming' ? (
        <div className="space-y-4">
          {grouped.map(({ group, events }) => (
            <Card key={group}>
              <h2 className={`mb-2 text-sm font-semibold ${group === 'overdue' ? 'text-error-700' : 'text-ink-800'}`}>{GROUP_LABEL[group]}</h2>
              <ul className="divide-y divide-surface-border">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 py-2.5">
                    <EventIcon e={e} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-ink-800">{e.title}</p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {e.source !== 'college' ? `${SOURCE_LABEL[e.source]} · ` : ''}
                        {e.date} ·{' '}
                        <span className={e.daysUntil < 0 ? 'font-medium text-error-600' : ''}>{countdownLabel(e.daysUntil)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => stepMonth(-1)}>←</Button>
            <h2 className="text-sm font-semibold text-ink-900">{monthLabel(calYear, calMonth)}</h2>
            <Button size="sm" variant="ghost" onClick={() => stepMonth(1)}>→</Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink-400">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const evs = byDate[cell.iso] ?? [];
              return (
                <div key={cell.iso} className={`min-h-[3.2rem] rounded-md border p-1 text-left ${cell.inMonth ? 'border-surface-border bg-surface-raised' : 'border-transparent bg-surface-sunken/40'}`}>
                  <div className={`text-[10px] ${cell.inMonth ? 'text-ink-500' : 'text-ink-300'}`}>{Number(cell.iso.slice(8))}</div>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {evs.slice(0, 4).map((e) => <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${SOURCE_DOT[e.source]}`} title={`${e.title} (${SOURCE_LABEL[e.source]})`} />)}
                    {evs.length > 4 ? <span className="text-[9px] text-ink-400">+{evs.length - 4}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Modal open={showAnalysis} onClose={() => setShowAnalysis(false)} title="Timeline focus">
        {analyzing ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : analysis ? (
          <div className="space-y-3 text-sm">
            <Section title="Focus now" tone="text-primary-700" items={analysis.priorities} />
            {analysis.conflicts.length ? <Section title="Conflicts" tone="text-error-700" items={analysis.conflicts} /> : null}
            <Section title="Don't forget" tone="text-warn-700" items={analysis.missing} />
            <Badge tone={analysis.source === 'curated' ? 'neutral' : 'primary'}>{analysis.source === 'curated' ? 'offline analysis' : 'AI analysis'}</Badge>
          </div>
        ) : (
          <p className="text-sm text-ink-500">No analysis available.</p>
        )}
      </Modal>
    </div>
  );
}

function Section({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-700">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}
