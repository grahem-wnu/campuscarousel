import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Field,
  Icon,
  Input,
  Modal,
  Spinner,
  Tabs,
  Textarea,
  safeHref,
  useToast,
  type TabItem,
} from '../../shared/ui';
import { CollegeLogo } from './CollegeLogo';
import { CollegeForm } from './CollegeForm';
import { HydrationBadge } from './HydrationBadge';
import { useActiveStudent } from '../../shared/shell';
import { BenchmarkCard } from '../peer-benchmark/BenchmarkCard';
import {
  PROGRAM_TYPE_LABEL,
  STATUS_META,
  acceptanceValue,
  assetsBusy,
  campusImageSrc,
  checklistPct,
  compactCost,
  costLabel,
  firstPercent,
  fitBand,
  gpaValue,
  hydrationMeta,
  rankValue,
} from './logic';
import {
  addNote,
  deleteCollege,
  getChecklist,
  getCollege,
  hydrateCollege,
  generatePrep,
  listNotes,
  putChecklist,
  suggestChecklist,
  updateCollege,
} from './api';
import type { ChecklistItem, College, CollegeInput, CollegeNote, HsPrepItem, HsPrepPlan } from './types';

type TabId = 'overview' | 'notes' | 'checklist' | 'prep' | 'fit' | 'photos';

/** College detail — branded header + Overview / Notes / Checklist / Fit tabs, edit, refresh, delete.
 *  Touchpoints, Visits, and Benchmark tabs are owned by their own modules and slot in separately. */
export default function CollegeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { activeStudent } = useActiveStudent();
  const [college, setCollege] = useState<College | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Swap back to the plain header if the cached campus photo fails to load.
  const [campusErrored, setCampusErrored] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCollege(await getCollege(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this college.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // While this college is mid-hydration OR mid imagery-fetch, poll so an async refresh fills the page
  // in without a manual reload (mirrors the list view). Photos arrive on the assets pipeline, which
  // is separate from — and often finishes after — text hydration, so we must watch both or a found
  // photo would never appear until a manual reload.
  useEffect(() => {
    if (!college || (!hydrationMeta(college.hydrationStatus)?.busy && !assetsBusy(college))) return;
    pollRef.current = setTimeout(() => void load(), 4000);
    return () => clearTimeout(pollRef.current);
  }, [college, load]);

  // Reset the photo-error flag whenever the cached campus image changes (e.g. after a refresh).
  useEffect(() => setCampusErrored(false), [college?.campusImageUrl]);

  async function onEdit(input: CollegeInput): Promise<void> {
    setBusy(true);
    try {
      const updated = await updateCollege(id, input);
      setCollege(updated);
      setShowEdit(false);
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh(): Promise<void> {
    setBusy(true);
    try {
      setCollege(await hydrateCollege(id));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(): Promise<void> {
    await deleteCollege(id);
    navigate('/colleges');
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size={28} /></div>;
  if (error || !college) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error ?? 'College not found.'}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => navigate('/colleges')}>
            Back to College Hub
          </Button>
        </Card>
      </div>
    );
  }

  const status = STATUS_META[college.status ?? 'researching'];
  const studentName = activeStudent?.name ?? 'this student';
  const fit = fitBand(college.fitScore);
  const accent = college.branding?.primaryColor;
  const campus = campusImageSrc(college);
  const hero = campus && !campusErrored;

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'notes', label: 'Notes' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'prep', label: 'Prepare' },
    { id: 'fit', label: 'Fit analysis' },
    { id: 'photos', label: 'Photos' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <button type="button" onClick={() => navigate('/colleges')} className="text-sm text-primary-600 hover:text-primary-700">
        ← College Hub
      </button>

      {/* Cached campus hero (downloaded + stored by the assets worker; stable + credited). */}
      {hero ? (
        <div className="relative h-44 w-full overflow-hidden rounded-xl bg-surface-sunken sm:h-56">
          <img
            src={campus ?? undefined}
            alt={`${college.name} campus`}
            className="h-full w-full object-cover"
            onError={() => setCampusErrored(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
          {college.campusImageCredit ? (
            <p className="absolute bottom-1.5 right-2 max-w-[80%] truncate text-[10px] text-white/85 drop-shadow" title={college.campusImageCredit}>
              {college.campusImageCredit}
            </p>
          ) : null}
        </div>
      ) : null}

      <Card
        className="space-y-3"
        style={accent ? { borderTopColor: accent, borderTopWidth: 4 } : undefined}
      >
        {/* Logo + name. */}
        <div className="flex items-center gap-3">
          <CollegeLogo college={college} size={56} className="shrink-0" />
          <h1 className="min-w-0 flex-1 text-xl font-bold leading-tight text-ink-900">{college.name}</h1>
        </div>

        {/* Status tags on the left, actions on the right (wraps when tight). */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {college.isTopPick ? <Badge tone="warn">★ Top pick</Badge> : null}
            <HydrationBadge status={college.hydrationStatus} />
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Edit</Button>
            <Button size="sm" variant="ghost" icon="course" loading={busy} onClick={() => void onRefresh()}>Refresh</Button>
          </div>
        </div>

        {/* Location · program · mascot. */}
        <p className="text-sm text-ink-500">
          {[college.location ?? college.state, college.programType ? PROGRAM_TYPE_LABEL[college.programType] : undefined]
            .filter(Boolean)
            .join(' · ') || '—'}
          {college.branding?.mascot ? ` · ${college.branding.mascot}` : ''}
        </p>

        {/* Quick links. */}
        <div className="flex flex-wrap gap-2 text-sm">
          {safeHref(college.contactInfo?.programAdmissionsUrl) ? (
            <a className="text-primary-600 hover:underline" href={safeHref(college.contactInfo?.programAdmissionsUrl)} target="_blank" rel="noreferrer">Program admissions</a>
          ) : null}
          {safeHref(college.contactInfo?.campusVisitUrl) ? (
            <a className="text-primary-600 hover:underline" href={safeHref(college.contactInfo?.campusVisitUrl)} target="_blank" rel="noreferrer">Plan a visit</a>
          ) : null}
          {safeHref(college.website) ? (
            <a className="text-primary-600 hover:underline" href={safeHref(college.website)} target="_blank" rel="noreferrer">Website</a>
          ) : null}
        </div>
      </Card>

      <Tabs items={tabs} value={tab} onChange={(t) => setTab(t as TabId)} />

      {tab === 'overview' ? (
        <OverviewTab college={college} onDelete={() => void onDelete()} />
      ) : tab === 'notes' ? (
        <NotesTab collegeId={id} />
      ) : tab === 'checklist' ? (
        <ChecklistTab college={college} onSaved={load} />
      ) : tab === 'prep' ? (
        <PrepTab college={college} onUpdate={setCollege} />
      ) : tab === 'photos' ? (
        <PhotosTab college={college} busy={busy} onRefresh={() => void onRefresh()} />
      ) : (
        <div className="space-y-4">
          <Card className="space-y-2">
            <h2 className="text-sm font-semibold text-ink-800">Fit analysis</h2>
            {fit ? <Badge tone={fit.tone}>{fit.label}</Badge> : <p className="text-sm text-ink-500">No fit score yet.</p>}
            <p className="text-sm text-ink-600">
              The fit score is set by AI against {studentName}’s profile during hydration; use <strong>Refresh</strong> to
              recompute it. The breakdown below compares each of their metrics to this school’s typical admitted
              student.
            </p>
          </Card>
          {/* Detailed per-metric comparison (GPA / TEAS / clinical + volunteer hours / certs vs this school). */}
          <BenchmarkCard collegeId={college.collegeId} />
        </div>
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit college" size="lg">
        <CollegeForm initial={college} busy={busy} onSubmit={(input) => void onEdit(input)} onCancel={() => setShowEdit(false)} />
      </Modal>
    </div>
  );
}

/** The three sections of an AI prep plan, each a labeled list with optional one-line detail. */
function PrepPlanView({ plan }: { plan: HsPrepPlan }) {
  const sections: { title: string; items: HsPrepItem[] }[] = [
    { title: 'Aim for', items: plan.targets },
    { title: 'Take these classes', items: plan.courses },
    { title: 'Strengthen your application', items: plan.activities },
  ].filter((s) => s.items.length > 0);
  return (
    <div className="space-y-4">
      {plan.headline ? <p className="text-sm text-ink-700">{plan.headline}</p> : null}
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{s.title}</h3>
          <ul className="space-y-1.5">
            {s.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Icon name="check" size={15} className="mt-0.5 shrink-0 text-primary-500" />
                <span>
                  <span className="font-medium text-ink-900">{it.label}</span>
                  {it.detail ? <span className="text-ink-500"> — {it.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Prepare tab — an AI plan for what to DO IN HIGH SCHOOL to be competitive for THIS college's
 *  program: recommended HS classes, GPA/test targets (from the college's admission bar), and
 *  activities. Generated on demand and persisted on the college. The college's own program-level
 *  requirements (admission criteria + in-major college courses) are shown below for reference — NOT
 *  as high-school to-dos (that was the old, confusing behavior). */
function PrepTab({ college, onUpdate }: { college: College; onUpdate: (c: College) => void }) {
  const plan = college.hsPrepPlan ?? null;
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(): Promise<void> {
    setGenerating(true);
    setError(null);
    try {
      const { plan: p } = await generatePrep(college.collegeId);
      if (!p) {
        setError("Couldn't generate a plan right now — try again in a moment.");
        return;
      }
      onUpdate({ ...college, hsPrepPlan: p });
    } catch {
      setError("Couldn't generate a plan right now — try again in a moment.");
    } finally {
      setGenerating(false);
    }
  }

  const programReqs = college.prerequisites ?? [];

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-800">How to prepare in high school</h2>
          {plan ? (
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
            >
              <Icon name="star" size={13} /> {generating ? 'Regenerating…' : 'Regenerate'}
            </button>
          ) : null}
        </div>

        {plan ? (
          <PrepPlanView plan={plan} />
        ) : (
          <div className="rounded-lg border border-dashed border-surface-border bg-surface-sunken px-4 py-6 text-center">
            <p className="text-sm font-medium text-ink-800">Get a game plan for {college.name}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500">
              AI builds a high-school plan tailored to this program — which classes to take (AP Physics, AP Calc…),
              the GPA/test scores to aim for, and the activities that strengthen your application.
            </p>
            <Button className="mt-3" icon="star" loading={generating} onClick={() => void generate()}>
              Generate my prep plan
            </Button>
          </div>
        )}

        {error ? <p className="text-xs text-error-600">{error}</p> : null}
        {plan ? (
          <p className="text-[11px] text-ink-400">
            AI guidance — confirm specifics with your counselor and the school. Regenerate after changing the major
            or refreshing the college.
          </p>
        ) : null}
      </Card>

      {programReqs.length > 0 ? (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-800">The program’s own requirements</h3>
          <p className="text-xs text-ink-500">
            What {college.name} lists for the major itself — admission criteria and college-level coursework you’ll
            handle <strong>once enrolled</strong>. These aren’t high-school to-dos; they’re here for reference.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
            {programReqs.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/** Photos tab — every campus image we have: the cached hero (downloaded + stored by the assets
 *  worker, always stable) first, then any AI-discovered web URLs from hydration, deduped. Each image
 *  drops itself if it fails to load, so a broken hotlink never leaves a gap. When nothing survives we
 *  show an empty state with a Refresh action (re-hydrate fetches a fresh campus photo + searches the
 *  web for more). */
function PhotosTab({ college, busy, onRefresh }: { college: College; busy: boolean; onRefresh: () => void }) {
  const all = [campusImageSrc(college), ...(college.campusImageUrls ?? [])].filter(
    (u): u is string => Boolean(u),
  );
  const photos = Array.from(new Set(all));
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const shown = photos.filter((u) => !broken.has(u));

  // The campus photo arrives on the async assets pipeline; while it's running, say so HERE (the user
  // clicked Refresh on this tab) rather than only flipping the badge on the header card.
  const searching = assetsBusy(college);

  if (shown.length === 0) {
    return (
      <Card className="space-y-3 py-8 text-center">
        {searching ? (
          <>
            <div className="flex justify-center"><Spinner size={22} /></div>
            <p className="text-sm font-medium text-ink-700">Searching for campus photos…</p>
            <p className="mx-auto max-w-sm text-xs text-ink-400">
              We’re fetching a campus photo and scanning the web — they’ll appear here automatically. This can take a minute.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-500">No campus photos yet.</p>
            <p className="mx-auto max-w-sm text-xs text-ink-400">
              Refresh fetches a campus photo and searches the web for more — they’ll appear here once found.
            </p>
            <div className="flex justify-center pt-1">
              <Button size="sm" variant="outline" icon="course" loading={busy} onClick={onRefresh}>Refresh</Button>
            </div>
          </>
        )}
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      {searching ? (
        <div className="flex items-center gap-2 text-xs text-ink-400"><Spinner size={13} /> Searching for more photos…</div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((url) => (
          <img
            key={url}
            src={url}
            alt={`${college.name} campus`}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-lg object-cover"
            onError={() => setBroken((prev) => new Set(prev).add(url))}
          />
        ))}
      </div>
      {college.campusImageCredit ? (
        <p className="text-[10px] text-ink-400" title={college.campusImageCredit}>{college.campusImageCredit}</p>
      ) : null}
    </Card>
  );
}

const NOT_FOUND = 'Data not found';
const yr = (n?: number): string => (n !== undefined ? `${costLabel(n)}/yr` : NOT_FOUND);

/** A readable label for a source URL: a title de-slugged from the last path segment, plus the site
 *  (host without 'www.'). Sources are stored as bare URLs, so this is derived heuristically. */
function sourceLabel(url: string): { title: string; site: string } {
  try {
    const u = new URL(url);
    const site = u.hostname.replace(/^www\./, '');
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
    const cleaned = decodeURIComponent(seg)
      .replace(/\.[a-z0-9]+$/i, '') // drop a file extension (.html, .htm, .php…)
      .replace(/[-_]+/g, ' ')
      .trim();
    const title = cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : site;
    return { title, site };
  } catch {
    return { title: url, site: '' };
  }
}

/** The structured stat grid — net price is the REAL after-aid figure (never tuition), shown alongside
 *  sticker tuition and full cost of attendance so the three are never conflated. */
function fieldRows(college: College): { label: string; value: string }[] {
  return [
    { label: 'Ranking', value: college.ranking ?? NOT_FOUND },
    { label: 'Acceptance (program)', value: college.acceptanceRateProgram ?? NOT_FOUND },
    { label: 'Acceptance (university)', value: college.acceptanceRateUniversity ?? NOT_FOUND },
    { label: 'Avg admitted GPA', value: college.avgGPAAdmitted ?? NOT_FOUND },
    { label: 'Out-of-state tuition', value: yr(college.tuitionOutOfState) },
    { label: 'Full cost of attendance', value: yr(college.costOfAttendanceOutOfState) },
    { label: 'Net price after aid', value: yr(college.estimatedNetPriceAfterAid) },
    { label: '% receiving aid', value: college.percentReceivingAid ?? NOT_FOUND },
    { label: 'Avg aid / scholarship', value: yr(college.avgAidAmount) },
    { label: 'Application fee', value: college.applicationFee !== undefined ? costLabel(college.applicationFee) : NOT_FOUND },
    { label: 'Early action', value: college.applicationDeadlines?.earlyAction ?? NOT_FOUND },
    { label: 'Regular decision', value: college.applicationDeadlines?.regularDecision ?? NOT_FOUND },
    { label: 'Program app deadline', value: college.applicationDeadlines?.programApp ?? NOT_FOUND },
    { label: 'Employment rate', value: college.employmentRate ?? NOT_FOUND },
  ];
}

/** Render a multi-paragraph narrative string (blank-line separated) as stacked paragraphs. */
function Narrative({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="text-sm leading-relaxed text-ink-700">{para.trim()}</p>
      ))}
    </>
  );
}

/** At-a-glance snapshot — the 6 stats someone clicking quickly through colleges wants without reading:
 *  prestige (rank), odds (acceptance + GPA bar), money (sticker vs after-aid), outcome (employment).
 *  Each is a single concise token pulled from the richer fields; the full detail lives in Key stats
 *  below. Self-hides until at least one value exists (an un-hydrated college shows nothing here). */
function KeyStatsStrip({ college }: { college: College }) {
  const stats: { label: string; value: string | null }[] = [
    { label: 'Rank', value: rankValue(college.ranking) },
    { label: 'Acceptance', value: acceptanceValue(college) },
    { label: 'Avg GPA', value: gpaValue(college.avgGPAAdmitted) },
    { label: 'All-in / yr', value: compactCost(college.costOfAttendanceOutOfState) },
    { label: 'Net price / yr', value: compactCost(college.estimatedNetPriceAfterAid) },
    { label: 'Employment', value: firstPercent(college.employmentRate) },
  ];
  if (stats.every((s) => s.value === null)) return null;

  return (
    <Card flush className="grid grid-cols-2 gap-px overflow-hidden bg-surface-border sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface-raised px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{s.label}</p>
          <p className={`mt-0.5 text-lg font-bold ${s.value === null ? 'text-ink-300' : 'text-ink-900'}`}>
            {s.value ?? '—'}
          </p>
        </div>
      ))}
    </Card>
  );
}

function OverviewTab({ college, onDelete }: { college: College; onDelete: () => void }) {
  const hasNarrative = Boolean(college.overview || college.admissionsDeepDive);
  return (
    <div className="space-y-5">
      {/* 0. At-a-glance snapshot — fast triage, above everything. */}
      <KeyStatsStrip college={college} />

      {/* 1. Narrative — the lead content. Hidden entirely until hydrated. */}
      {hasNarrative ? (
        <Card className="space-y-4">
          {college.overview ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-ink-800">About {college.name}</h2>
              <Narrative text={college.overview} />
            </div>
          ) : null}
          {college.admissionsDeepDive ? (
            <div className="space-y-2 border-t border-surface-border pt-4">
              <h2 className="text-sm font-semibold text-ink-800">Getting in</h2>
              <Narrative text={college.admissionsDeepDive} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* 2. Student voices. */}
      {college.testimonials?.length ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-800">Student voices</h2>
          <div className="space-y-3">
            {college.testimonials.map((t, i) => (
              <figure key={i} className="border-l-2 border-primary-300 pl-3">
                <blockquote className="text-sm italic text-ink-700">“{t.quote}”</blockquote>
                {(t.attribution || t.source) && (
                  <figcaption className="mt-1 text-xs text-ink-400">
                    {t.attribution ?? 'Student'}
                    {safeHref(t.source) ? (
                      <>
                        {' · '}
                        <a className="text-primary-600 hover:underline" href={safeHref(t.source)} target="_blank" rel="noreferrer">source</a>
                      </>
                    ) : null}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </Card>
      ) : null}

      {/* 3. Program details — major-specific labeled facts (e.g. nursing → NCLEX-RN pass rate). */}
      {college.programDetails?.length ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-800">Program details</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {college.programDetails.map((row) => (
              <div key={row.label} className="flex justify-between gap-3 border-b border-surface-border py-1.5 text-sm">
                <dt className="text-ink-500">{row.label}</dt>
                <dd className="text-ink-800">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      {/* 4. Key stats. */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-800">Key stats</h2>
          {college.lastDataRefresh ? (
            <span className="text-xs text-ink-400">Last refreshed {college.lastDataRefresh.slice(0, 10)}</span>
          ) : null}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {fieldRows(college).map((row) => (
            <div key={row.label} className="flex justify-between gap-3 border-b border-surface-border py-1.5 text-sm">
              <dt className="text-ink-500">{row.label}</dt>
              <dd className={row.value === NOT_FOUND ? 'text-ink-400 italic' : 'text-ink-800'}>{row.value}</dd>
            </div>
          ))}
        </dl>
        {college.prerequisites?.length ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Prerequisites</h3>
            <p className="mt-1 text-sm text-ink-700">{college.prerequisites.join(', ')}</p>
          </div>
        ) : null}
        {college.requiredTests?.length ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Required tests</h3>
            <p className="mt-1 text-sm text-ink-700">{college.requiredTests.join(', ')}</p>
          </div>
        ) : null}
        {college.specialNotes ? <p className="text-sm text-ink-600">{college.specialNotes}</p> : null}
      </Card>

      {/* 5. Sources — let the family verify and dig deeper. */}
      {college.dataSources?.length ? (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Sources</h2>
            {college.dataAsOf ? <span className="text-xs text-ink-400">{college.dataAsOf}</span> : null}
          </div>
          <ul className="space-y-2">
            {(() => {
              const titleByUrl = new Map((college.dataSourceTitles ?? []).map((t) => [t.url, t.title]));
              return college.dataSources.map((src) => {
                const parsed = sourceLabel(src);
                const title = titleByUrl.get(src) ?? parsed.title; // hydration-resolved title, else URL-parsed
                const site = parsed.site;
                // Sources are AI/web-sourced URLs — only link out when the href is a safe http(s)
                // URL; otherwise show the card inert (no clickable javascript:/data: target).
                const href = safeHref(src);
                const body = (
                  <>
                    <p className="flex items-center gap-1 truncate text-sm font-medium text-ink-800 group-hover:text-primary-700">
                      {title}
                      <Icon name="chevron-right" size={13} className="text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-500" />
                    </p>
                    {site && site !== title ? <p className="truncate text-xs text-ink-400">{site}</p> : null}
                  </>
                );
                return (
                <li key={src}>
                  {href ? (
                    <a
                      className="group block rounded-lg border border-surface-border px-3 py-2 transition hover:border-primary-200 hover:bg-surface-sunken"
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="block rounded-lg border border-surface-border px-3 py-2">{body}</div>
                  )}
                </li>
                );
              });
            })()}
          </ul>
        </Card>
      ) : null}

      <div>
        <Button size="sm" variant="danger" onClick={onDelete}>Remove college</Button>
      </div>
    </div>
  );
}

function NotesTab({ collegeId }: { collegeId: string }) {
  const [notes, setNotes] = useState<CollegeNote[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotes(await listNotes(collegeId));
    } finally {
      setLoading(false);
    }
  }, [collegeId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await addNote(collegeId, draft.trim());
      setDraft('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3">
      <Field label="Add a note">
        <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A visit impression, a call with admissions…" />
      </Field>
      <Button size="sm" loading={saving} disabled={!draft.trim()} onClick={() => void add()}>Add note</Button>
      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : notes.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-500">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.noteId} className="rounded-md bg-surface-sunken p-3 text-sm">
              <p className="text-ink-800">{n.content}</p>
              <p className="mt-1 text-xs text-ink-400">{n.author} · {n.createdAt.slice(0, 10)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChecklistTab({ college, onSaved }: { college: College; onSaved: () => Promise<void> }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();
  const pct = checklistPct(items);

  // Load the checklist from the college's own checklist resource on mount.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const cl = await getChecklist(college.collegeId);
        if (active) setItems(cl);
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [college.collegeId]);

  async function persist(next: ChecklistItem[]): Promise<void> {
    setItems(next);
    setSaving(true);
    try {
      await putChecklist(college.collegeId, next);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    if (!label.trim()) return;
    const item: ChecklistItem = { id: `i-${items.length + 1}-${label.trim().slice(0, 8)}`, label: label.trim(), completed: false };
    void persist([...items, item]);
    setLabel('');
  }

  // Generate a college + major-specific checklist (AI). Merges in only NEW steps (case-insensitive
  // dedupe) so it never clobbers manual or already-checked items, then persists once.
  async function generate(): Promise<void> {
    setGenerating(true);
    try {
      const suggestions = await suggestChecklist(college.collegeId);
      if (suggestions.length === 0) {
        toast.error("Couldn't generate steps right now — add them manually below.");
        return;
      }
      const have = new Set(items.map((i) => i.label.trim().toLowerCase()));
      const additions: ChecklistItem[] = [];
      suggestions.forEach((s, idx) => {
        const key = s.label.trim().toLowerCase();
        if (!key || have.has(key)) return;
        have.add(key);
        additions.push({
          id: `i-gen-${items.length + idx}-${s.label.trim().slice(0, 8)}`,
          label: s.label.trim(),
          completed: false,
          ...(s.dueDate ? { dueDate: s.dueDate } : {}),
        });
      });
      if (additions.length === 0) {
        toast.info('Those steps are already on your checklist.');
        return;
      }
      await persist([...items, ...additions]);
      toast.success(`Added ${additions.length} step${additions.length === 1 ? '' : 's'} for ${college.name}.`);
    } catch {
      toast.error("Couldn't generate steps right now — add them manually below.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card className="space-y-3">
      {pct !== null ? (
        <div>
          <div className="flex justify-between text-xs text-ink-500"><span>Progress</span><span>{pct}%</span></div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-200">
            <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {/* Empty state: invite the family to auto-build a tailored application checklist. */}
      {loaded && items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-border bg-surface-sunken px-4 py-5 text-center">
          <p className="text-sm font-medium text-ink-800">No steps yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500">
            Generate an application checklist tailored to {college.name} and the student&rsquo;s major — deadlines,
            essays, tests, and fees included. You can edit or remove any step after.
          </p>
          <Button className="mt-3" icon="star" loading={generating} onClick={() => void generate()}>
            Generate application steps
          </Button>
        </div>
      ) : null}

      <ul className="space-y-1.5">
        {items.map((it, idx) => (
          <li key={it.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={it.completed}
              onChange={() => void persist(items.map((x, i) => (i === idx ? { ...x, completed: !x.completed } : x)))}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-border text-primary-600"
            />
            <span className={it.completed ? 'text-ink-400 line-through' : 'text-ink-800'}>
              {it.label}
              {it.dueDate ? <span className="ml-2 text-xs text-ink-400">· due {it.dueDate}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-end gap-2">
        <Field label="Add a checklist item" className="flex-1">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Request transcript" />
        </Field>
        <Button size="sm" loading={saving} disabled={!label.trim()} onClick={addItem}>Add</Button>
      </div>

      {/* When the list isn't empty, still offer to top it up with AI-suggested steps. */}
      {items.length > 0 ? (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
        >
          <Icon name="star" size={13} /> {generating ? 'Generating…' : 'Suggest more steps'}
        </button>
      ) : null}
    </Card>
  );
}
