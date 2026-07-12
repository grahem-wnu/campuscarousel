import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Icon, Spinner } from "../../shared/ui";
import { useActiveStudent } from "../../shared/shell";
import { getFocus, refreshOverview, refreshCareerPath } from "./api";
import type { FocusOverview, FocusResponse, PackCertification, PackSummary } from "./types";
import { Markdown } from "./Markdown";

/** Hostname (without www.) of a URL, for the source sub-line; empty string if unparseable. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * One web-grounded AI document (the major overview or the career path), with its full lifecycle:
 * empty → generate, pending → spinner (or a stalled "try again" after the poll cap), complete →
 * markdown + sources + Refresh, failed → retry, stale → an inline refresh nudge.
 */
function AsyncDocCard(props: {
  title: string;
  doc: FocusOverview | null;
  stale: boolean;
  stalled: boolean;
  generating: boolean;
  onGenerate: () => void;
  pendingLabel: string;
  emptyPrompt: string;
  generateLabel: string;
  staleLabel: string;
}) {
  const { title, doc, stale, stalled, generating, onGenerate, pendingLabel, emptyPrompt, generateLabel, staleLabel } = props;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionTitle>{title}</SectionTitle>
        {doc?.status === "complete" && !stale ? (
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={generating}>Refresh</Button>
        ) : null}
      </div>

      {stalled && doc?.status === "pending" ? (
        <div className="py-2">
          <p className="text-sm text-ink-500">This is taking longer than expected — it may have failed to generate.</p>
          <Button className="mt-2" size="sm" onClick={onGenerate} disabled={generating}>Try again</Button>
        </div>
      ) : doc?.status === "pending" || generating ? (
        <div className="flex items-center gap-3 py-6 text-sm text-ink-500">
          <Spinner size={20} /> {pendingLabel}
        </div>
      ) : doc?.status === "complete" ? (
        <>
          {stale ? (
            <div className="mb-3 rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-xs text-warn-800">
              {staleLabel} <button onClick={onGenerate} className="font-semibold underline">Refresh it</button>.
            </div>
          ) : null}
          {doc.overview ? <Markdown text={doc.overview} /> : null}
          {doc.sources && doc.sources.length > 0 ? (
            <div className="mt-4 border-t border-surface-border pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Sources</p>
              <ul className="space-y-2">
                {doc.sources.map((s, i) => {
                  const host = hostOf(s.url);
                  return (
                    <li key={i}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group block rounded-lg border border-surface-border px-3 py-2 transition hover:border-primary-200 hover:bg-surface-sunken"
                      >
                        <p className="truncate text-sm font-medium text-ink-800 group-hover:text-primary-700">{s.title || host}</p>
                        {host && host !== s.title ? <p className="truncate text-xs text-ink-400">{host}</p> : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      ) : doc?.status === "failed" ? (
        <div className="py-2">
          <p className="text-sm text-error-600">Couldn't be generated{doc.error ? `: ${doc.error}` : "."}</p>
          <Button className="mt-2" size="sm" onClick={onGenerate} disabled={generating}>Try again</Button>
        </div>
      ) : (
        <div className="py-2">
          <p className="text-sm text-ink-500">{emptyPrompt}</p>
          <Button className="mt-3" onClick={onGenerate} disabled={generating}>{generateLabel}</Button>
        </div>
      )}
    </Card>
  );
}

/** A heading row for a pack content section. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold text-ink-800">{children}</h2>;
}

/** The merged, instant pack content shown on the focus page. The spec ("major packs") says a student
 *  with two majors activates two packs whose *contributions merge* — so we render one set of cards, not
 *  one set per major. See {@link mergePackContent}. */
interface MergedPackContent {
  entranceExam?: PackSummary["entranceExam"];
  certifications: PackCertification[];
  interviewQuestions: string[];
  visitQuestions: string[];
}

/** Fold the resolved packs into a single set of contributions: certifications deduped by name,
 *  questions deduped by text, and the entrance exam from the first pack that defines one (mirrors the
 *  backend folds `packCertifications` / `packEntranceExam`). Without this, a two-major student sees the
 *  same section titles (certs, interview, visit questions) repeated once per major. */
function mergePackContent(packs: PackSummary[]): MergedPackContent {
  const certs: PackCertification[] = [];
  const certSeen = new Set<string>();
  for (const p of packs) {
    for (const c of p.certifications) {
      const key = c.name.trim().toLowerCase();
      if (!key || certSeen.has(key)) continue;
      certSeen.add(key);
      certs.push(c);
    }
  }
  const dedupeText = (lists: string[][]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const list of lists) {
      for (const v of list) {
        const key = v.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(v);
      }
    }
    return out;
  };
  return {
    entranceExam: packs.find((p) => p.entranceExam)?.entranceExam,
    certifications: certs,
    interviewQuestions: dedupeText(packs.map((p) => p.interviewQuestions)),
    visitQuestions: dedupeText(packs.map((p) => p.visitQuestions)),
  };
}

/** The curated, instant pack content (exam, certs, questions) — what's tailored, with deep links. */
function PackDetails({ content }: { content: MergedPackContent }) {
  return (
    <div className="space-y-4">
      {content.entranceExam ? (
        <Card>
          <SectionTitle>Entrance exam</SectionTitle>
          <Link to="/exams" className="group flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-ink-900">{content.entranceExam.examName}</p>
              {content.entranceExam.competitiveScore != null ? (
                <p className="text-xs text-ink-500">Competitive score ≈ {content.entranceExam.competitiveScore}</p>
              ) : null}
              {content.entranceExam.note ? <p className="mt-0.5 text-xs text-ink-500">{content.entranceExam.note}</p> : null}
            </div>
            <Badge tone="primary">Test Prep <Icon name="chevron-right" size={13} /></Badge>
          </Link>
        </Card>
      ) : null}

      {content.certifications.length > 0 ? (
        <Card>
          <SectionTitle>Recommended certifications</SectionTitle>
          <ul className="divide-y divide-surface-border">
            {content.certifications.map((c) => (
              <li key={c.name} className="py-2">
                <p className="text-sm font-medium text-ink-900">
                  {c.name}
                  {c.issuingOrganization ? <span className="font-normal text-ink-400"> · {c.issuingOrganization}</span> : null}
                </p>
                <p className="text-xs text-ink-500">{c.why}</p>
              </li>
            ))}
          </ul>
          <Link to="/certifications" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
            Track certifications <Icon name="chevron-right" size={13} />
          </Link>
        </Card>
      ) : null}

      {content.interviewQuestions.length > 0 ? (
        <Card>
          <SectionTitle>Interview questions to prepare</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
            {content.interviewQuestions.map((q) => <li key={q}>{q}</li>)}
          </ul>
          <Link to="/interviews" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
            Practice interviews <Icon name="chevron-right" size={13} />
          </Link>
        </Card>
      ) : null}

      {content.visitQuestions.length > 0 ? (
        <Card>
          <SectionTitle>Ask on campus visits</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
            {content.visitQuestions.map((q) => <li key={q}>{q}</li>)}
          </ul>
          <Link to="/visits" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
            Plan a visit <Icon name="chevron-right" size={13} />
          </Link>
        </Card>
      ) : null}
    </div>
  );
}

export default function FocusPage() {
  const { activeStudentId } = useActiveStudent();
  const [data, setData] = useState<FocusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genOverview, setGenOverview] = useState(false);
  const [genCareer, setGenCareer] = useState(false);
  const [stalled, setStalled] = useState(false);
  const attemptsRef = useRef(0);

  const load = useCallback(async () => {
    try {
      setData(await getFocus());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your focus.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, activeStudentId]);

  // Poll while EITHER async doc (overview or career path) is being generated by the worker. A
  // persistent interval (not a one-shot timeout) is essential: the status stays "pending" across polls,
  // so a timeout keyed on it would never re-arm and polling would stall after the first tick. The
  // interval lives until both statuses flip. Capped at ~6 min (beyond the worker's 300s ceiling) so a
  // dead job surfaces a message, not a forever-spinner. A completed doc never shows the stalled state.
  const anyPending = data?.overview?.status === "pending" || data?.careerPath?.status === "pending";
  useEffect(() => {
    if (!anyPending) {
      attemptsRef.current = 0;
      setStalled(false);
      return;
    }
    const id = setInterval(() => {
      attemptsRef.current += 1;
      if (attemptsRef.current > 90) {
        clearInterval(id);
        setStalled(true);
        return;
      }
      void load();
    }, 4000);
    return () => clearInterval(id);
  }, [anyPending, load]);

  async function generateOverview() {
    setGenOverview(true);
    setStalled(false);
    attemptsRef.current = 0;
    try {
      await refreshOverview();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the overview.");
    } finally {
      setGenOverview(false);
    }
  }

  async function generateCareer() {
    setGenCareer(true);
    setStalled(false);
    attemptsRef.current = 0;
    try {
      await refreshCareerPath();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the career path.");
    } finally {
      setGenCareer(false);
    }
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size={28} /></div>;

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => { setLoading(true); void load(); }}>Retry</Button>
        </Card>
      </div>
    );
  }

  // No major set yet → point to the Family page where it's chosen.
  if (!data || data.packs.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <EmptyState
          icon="star"
          title="Pick an academic focus"
          description="Set an intended major on the Family page and this becomes your major hub — a tailored overview, the entrance exam, recommended certifications, and the questions to ask, all in one place."
        />
        <div className="mt-4 flex justify-center">
          <Link to="/family"><Button>Set intended major</Button></Link>
        </div>
      </div>
    );
  }

  const ov = data.overview;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-ink-900">Your focus</h1>
        {data.packs.map((p) => <Badge key={p.key} tone="primary">{p.label}</Badge>)}
      </header>
      <p className="-mt-2 text-sm text-ink-500">
        {data.careerGoal ? `Toward your goal: ${data.careerGoal}. ` : ""}
        Everything below is tailored to this focus, and the AI across the app uses it too.
      </p>

      {/* AI web-grounded overview of the major(s) */}
      <AsyncDocCard
        title="Overview"
        doc={ov}
        stale={data.stale}
        stalled={stalled}
        generating={genOverview}
        onGenerate={generateOverview}
        pendingLabel={`Researching ${data.packs[0]?.label ?? "your major"} on the web… this takes up to a minute.`}
        emptyPrompt={`Get an AI overview of pursuing ${data.packs.map((p) => p.label).join(" + ")} — what it involves, how to prepare, and the career outlook, grounded in current web sources.`}
        generateLabel="Generate overview"
        staleLabel="Your major changed since this was written."
      />

      {/* AI web-grounded career path from the free-text career goal */}
      {data.careerGoal ? (
        <AsyncDocCard
          title="Career path"
          doc={data.careerPath}
          stale={data.careerStale}
          stalled={stalled}
          generating={genCareer}
          onGenerate={generateCareer}
          pendingLabel={`Mapping the path to ${data.careerGoal} on the web… this takes up to a minute.`}
          emptyPrompt={`See the path from school to "${data.careerGoal}" — the majors that lead there, the degrees and licenses, and what to start now.`}
          generateLabel="Generate career path"
          staleLabel="Your career goal changed since this was written."
        />
      ) : (
        <Card>
          <SectionTitle>Career path</SectionTitle>
          <p className="text-sm text-ink-500">
            Set a career goal on the <Link to="/family" className="font-medium text-primary-600 hover:text-primary-700">Family page</Link> and the AI will map the full path to get there.
          </p>
        </Card>
      )}

      {/* One merged set of cards across all active majors (spec: contributions merge), not one per pack. */}
      <PackDetails content={mergePackContent(data.packs)} />
    </div>
  );
}
