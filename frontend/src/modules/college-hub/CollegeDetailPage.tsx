import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Spinner,
  Tabs,
  Textarea,
  type TabItem,
} from '../../shared/ui';
import { CollegeLogo } from './CollegeLogo';
import { CollegeForm } from './CollegeForm';
import {
  PROGRAM_TYPE_LABEL,
  STATUS_META,
  campusImageSrc,
  checklistPct,
  costLabel,
  fitBand,
  hydrationMeta,
} from './logic';
import {
  addNote,
  deleteCollege,
  getChecklist,
  getCollege,
  hydrateCollege,
  listNotes,
  putChecklist,
  updateCollege,
} from './api';
import type { ChecklistItem, College, CollegeInput, CollegeNote } from './types';

type TabId = 'overview' | 'notes' | 'checklist' | 'fit';

/** College detail — branded header + Overview / Notes / Checklist / Fit tabs, edit, refresh, delete.
 *  Touchpoints, Visits, and Benchmark tabs are owned by their own modules and slot in separately. */
export default function CollegeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
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

  // While this college is mid-hydration, poll so an async refresh fills the page in without a manual
  // reload (mirrors the list view). hydrationMeta(...).busy is true only for pending/in-progress.
  useEffect(() => {
    if (!college || !hydrationMeta(college.hydrationStatus)?.busy) return;
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
  const hyd = hydrationMeta(college.hydrationStatus);
  const fit = fitBand(college.fitScore);
  const accent = college.branding?.primaryColor;
  const campus = campusImageSrc(college);
  const hero = campus && !campusErrored;

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'notes', label: 'Notes' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'fit', label: 'Fit analysis' },
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
        className="flex flex-wrap items-center gap-4"
        style={accent ? { borderTopColor: accent, borderTopWidth: 4 } : undefined}
      >
        <CollegeLogo college={college} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ink-900">{college.name}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
            {college.isTopPick ? <Badge tone="warn">★ Top pick</Badge> : null}
            {hyd ? <Badge tone={hyd.tone}>{hyd.label}</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-ink-500">
            {[college.location ?? college.state, college.programType ? PROGRAM_TYPE_LABEL[college.programType] : undefined]
              .filter(Boolean)
              .join(' · ') || '—'}
            {college.branding?.mascot ? ` · ${college.branding.mascot}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {college.contactInfo?.programAdmissionsUrl ? (
              <a className="text-primary-600 hover:underline" href={college.contactInfo.programAdmissionsUrl} target="_blank" rel="noreferrer">Program admissions</a>
            ) : null}
            {college.contactInfo?.campusVisitUrl ? (
              <a className="text-primary-600 hover:underline" href={college.contactInfo.campusVisitUrl} target="_blank" rel="noreferrer">Plan a visit</a>
            ) : null}
            {college.website ? (
              <a className="text-primary-600 hover:underline" href={college.website} target="_blank" rel="noreferrer">Website</a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>Edit</Button>
          <Button size="sm" variant="ghost" icon="course" loading={busy} onClick={() => void onRefresh()}>Refresh</Button>
        </div>
      </Card>

      {/* AI-discovered campus photos (web-grounded hydration); a richer set below the cached hero. */}
      <CampusGallery urls={college.campusImageUrls} />

      <Tabs items={tabs} value={tab} onChange={(t) => setTab(t as TabId)} />

      {tab === 'overview' ? (
        <OverviewTab college={college} onDelete={() => void onDelete()} />
      ) : tab === 'notes' ? (
        <NotesTab collegeId={id} />
      ) : tab === 'checklist' ? (
        <ChecklistTab college={college} onSaved={load} />
      ) : (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-800">Fit analysis</h2>
          {fit ? <Badge tone={fit.tone}>{fit.label}</Badge> : <p className="text-sm text-ink-500">No fit score yet.</p>}
          <p className="text-sm text-ink-600">
            Fit is scored by AI against Keira’s profile (GPA, clinical hours, test scores) during hydration.
            Use <strong>Refresh</strong> to recompute it as her profile grows.
          </p>
        </Card>
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit college" size="lg">
        <CollegeForm initial={college} busy={busy} onSubmit={(input) => void onEdit(input)} onCancel={() => setShowEdit(false)} />
      </Modal>
    </div>
  );
}

/** Campus photo banner. Best-effort URLs from hydration: any image that fails to load is dropped,
 *  and the whole strip disappears if none survive — so a broken URL never leaves a gap. */
function CampusGallery({ urls }: { urls?: string[] }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const shown = (urls ?? []).filter((u) => !broken.has(u)).slice(0, 4);
  if (shown.length === 0) return null;
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-2 overflow-hidden rounded-xl" style={{ height: 160 }}>
      {shown.map((url) => (
        <img
          key={url}
          src={url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken((prev) => new Set(prev).add(url))}
        />
      ))}
    </div>
  );
}

const NOT_FOUND = 'Data not found';
const yr = (n?: number): string => (n !== undefined ? `${costLabel(n)}/yr` : NOT_FOUND);

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

function OverviewTab({ college, onDelete }: { college: College; onDelete: () => void }) {
  const hasNarrative = Boolean(college.overview || college.admissionsDeepDive);
  return (
    <div className="space-y-5">
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
                    {t.source ? (
                      <>
                        {' · '}
                        <a className="text-primary-600 hover:underline" href={t.source} target="_blank" rel="noreferrer">source</a>
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
          <ul className="space-y-1 text-sm">
            {college.dataSources.map((src) => (
              <li key={src}>
                <a className="break-all text-primary-600 hover:underline" href={src} target="_blank" rel="noreferrer">{src}</a>
              </li>
            ))}
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
      <ul className="space-y-1.5">
        {items.map((it, idx) => (
          <li key={it.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={it.completed}
              onChange={() => void persist(items.map((x, i) => (i === idx ? { ...x, completed: !x.completed } : x)))}
              className="h-4 w-4 rounded border-surface-border text-primary-600"
            />
            <span className={it.completed ? 'text-ink-400 line-through' : 'text-ink-800'}>{it.label}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <Field label="Add a checklist item" className="flex-1">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Request transcript" />
        </Field>
        <Button size="sm" loading={saving} disabled={!label.trim()} onClick={addItem}>Add</Button>
      </div>
    </Card>
  );
}
