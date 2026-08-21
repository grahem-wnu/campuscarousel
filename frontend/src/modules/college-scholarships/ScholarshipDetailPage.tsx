// Standalone page for one scholarship's research dossier.
//
// This used to expand inline inside the award list. That was wrong twice over: a fifteen-section
// dossier is a document, not a row, and on a college with twenty-odd awards the expansion pushed
// everything below it down the page — so "See details" read as if it had done nothing. It now has
// its own URL, which also means a family can bookmark an award or send it to each other.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Icon, Spinner, safeHref, useToast } from '../../shared/ui';
import { getCollege } from '../college-hub/api';
import { deleteScholarship, getScholarship, startResearch, trackScholarship } from './api';
import { CATEGORY_LABEL, hasResearch, researchBusy, scholarshipMeta } from './logic';
import { ResearchView } from './ResearchView';
import type { CollegeScholarship } from './types';

const POLL_MS = 5000;
const RESEARCH_POLLS = 48; // ~4 min
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RESEARCH_ERR = 'Couldn’t finish that research — try again in a moment.';

export default function ScholarshipDetailPage() {
  const { id = '', scholarshipId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [award, setAward] = useState<CollegeScholarship | null>(null);
  const [collegeName, setCollegeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const backToCollege = useCallback(() => navigate(`/colleges/${encodeURIComponent(id)}`), [navigate, id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const found = await getScholarship(id, scholarshipId);
        if (cancelled || !mounted.current) return;
        setAward(found);
        // The college name is only for the header and the back link, so a failure here must not
        // take the page down with it.
        getCollege(id)
          .then((c) => mounted.current && !cancelled && setCollegeName(c.name))
          .catch(() => {});
      } catch (err) {
        if (!cancelled && mounted.current) {
          setError(err instanceof Error ? err.message : 'Could not load this scholarship.');
        }
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, scholarshipId]);

  /** Research (or re-research) this one award, polling until its dossier settles. */
  async function research(): Promise<void> {
    setResearching(true);
    setError(null);
    try {
      const started = await startResearch(id, scholarshipId);
      if (!mounted.current) return;
      setAward(started);
      if (!researchBusy(started)) {
        if (started.researchStatus === 'failed') setError(RESEARCH_ERR);
        return;
      }
      for (let i = 0; i < RESEARCH_POLLS; i++) {
        await sleep(POLL_MS);
        if (!mounted.current) return;
        let fresh;
        try {
          fresh = await getScholarship(id, scholarshipId);
        } catch {
          continue; // transient read error — keep waiting
        }
        if (!mounted.current) return;
        setAward(fresh);
        if (fresh.researchStatus === 'complete') return;
        if (fresh.researchStatus === 'failed') {
          setError(RESEARCH_ERR);
          return;
        }
      }
      if (mounted.current) setError('Still researching — check back in a minute.');
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : RESEARCH_ERR);
    } finally {
      if (mounted.current) setResearching(false);
    }
  }

  async function onTrack(): Promise<void> {
    if (!award) return;
    try {
      await trackScholarship(award, collegeName || 'this college');
      toast.success(`Added “${award.name}” to your scholarship tracker.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not track that scholarship.');
    }
  }

  async function onRemove(): Promise<void> {
    if (!award) return;
    try {
      await deleteScholarship(id, scholarshipId);
      toast.success(`Removed “${award.name}”.`);
      backToCollege();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove that scholarship.');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} />
      </div>
    );
  }

  if (!award) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error ?? 'Scholarship not found.'}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={backToCollege}>
            Back to the college
          </Button>
        </Card>
      </div>
    );
  }

  const meta = scholarshipMeta(award);
  const busy = researching || researchBusy(award);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <button type="button" onClick={backToCollege} className="text-sm text-primary-600 hover:text-primary-700">
        ← {collegeName ? `Scholarships at ${collegeName}` : 'Back to the college'}
      </button>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="min-w-0 flex-1 text-xl font-bold leading-tight text-ink-900">{award.name}</h1>
          {award.category ? <Badge tone="neutral">{CATEGORY_LABEL[award.category]}</Badge> : null}
        </div>
        {award.provider ? <p className="text-sm text-ink-500">{award.provider}</p> : null}
        {award.summary ? <p className="text-sm text-ink-700">{award.summary}</p> : null}
        {meta.length > 0 ? <p className="text-xs text-ink-600">{meta.join(' · ')}</p> : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {hasResearch(award) ? (
            <Button size="sm" variant="outline" icon="scholarship" onClick={() => void onTrack()}>
              Track this
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon="search" loading={busy} onClick={() => void research()}>
            {hasResearch(award) ? 'Research again' : 'Research'}
          </Button>
          {safeHref(award.url) ? (
            <a
              className="text-xs text-primary-600 hover:underline"
              href={safeHref(award.url)}
              target="_blank"
              rel="noreferrer"
            >
              Scholarship page
            </a>
          ) : null}
          <button type="button" className="ml-auto text-xs text-ink-400 hover:text-error-600" onClick={() => void onRemove()}>
            Remove
          </button>
        </div>

        {error ? <p className="text-xs text-error-600">{error}</p> : null}
      </Card>

      {busy ? (
        <Card className="flex items-center gap-3">
          <Spinner size={18} />
          <div>
            <p className="text-sm font-medium text-ink-800">Researching “{award.name}”…</p>
            <p className="text-xs text-ink-500">
              Reading the school’s own pages for the odds, the criteria, the process, and who to contact. A couple of
              minutes — you can leave this page and come back.
            </p>
          </div>
        </Card>
      ) : hasResearch(award) && award.research ? (
        <ResearchView research={award.research} />
      ) : (
        <Card className="space-y-2 text-center">
          <Icon name="scholarship" size={22} className="mx-auto text-primary-500" />
          <p className="text-sm font-medium text-ink-800">This one hasn’t been researched yet</p>
          <p className="mx-auto max-w-md text-xs text-ink-500">
            We’ll dig up what the award really is, your realistic odds, what wins it, how to apply, the dates that
            matter, and the actual people to contact.
          </p>
          <Button className="mt-1" icon="search" loading={researching} onClick={() => void research()}>
            Research this scholarship
          </Button>
        </Card>
      )}
    </div>
  );
}
