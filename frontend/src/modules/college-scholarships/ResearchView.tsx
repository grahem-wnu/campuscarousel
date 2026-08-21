// Renders one award's deep-research dossier. Every section is optional — a short, honest dossier is
// a success — so each block renders only when it has content, and the whole view degrades to
// "nothing came back" rather than a page of empty headings.
//
// Contacts get special care: an email or phone only becomes a clickable link, and it is only shown
// at all, when the backend parser accepted it as a real one. Nothing here fabricates a link.

import type { ReactNode } from 'react';
import { Badge, Card, Icon, safeHref } from '../../shared/ui';
import { COMPETITIVENESS_LABEL, COMPETITIVENESS_TONE } from './logic';
import type { ResearchContact, ResearchPoint, ScholarshipResearch } from './types';

/** A titled block that disappears when it has nothing to say. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</h3>
      {children}
    </div>
  );
}

/** The label/detail list shape used by "how to win", "what to expect", and the steps. */
function PointList({ items, numbered }: { items: ResearchPoint[]; numbered?: boolean }) {
  return (
    <ol className="space-y-1.5">
      {items.map((p, i) => (
        <li key={`${p.label}-${i}`} className="flex items-start gap-2 text-sm">
          {numbered ? (
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">
              {i + 1}
            </span>
          ) : (
            <Icon name="check" size={15} className="mt-0.5 shrink-0 text-primary-500" />
          )}
          <span>
            <span className="font-medium text-ink-900">{p.label}</span>
            {p.detail ? <span className="text-ink-500"> — {p.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

/** One person card. Email/phone are links only when they're real (the API parser already dropped
 *  anything that wasn't), so a family never clicks a fabricated address. */
function ContactCard({ c }: { c: ResearchContact }) {
  const line = [c.title, c.department].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border border-surface-border bg-surface-sunken px-3 py-2">
      <p className="text-sm font-medium text-ink-900">{c.name || line || 'Contact'}</p>
      {c.name && line ? <p className="text-xs text-ink-500">{line}</p> : null}
      {c.note ? <p className="mt-0.5 text-xs text-ink-600">{c.note}</p> : null}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {c.email ? (
          <a className="text-primary-600 hover:underline" href={`mailto:${c.email}`}>
            {c.email}
          </a>
        ) : null}
        {c.phone ? <span className="text-ink-600">{c.phone}</span> : null}
        {c.office ? <span className="text-ink-500">{c.office}</span> : null}
      </div>
    </div>
  );
}

function People({ title, people }: { title: string; people: ResearchContact[] }) {
  return (
    <Section title={title}>
      <div className="grid gap-2 sm:grid-cols-2">
        {people.map((c, i) => (
          <ContactCard key={`${c.name ?? c.title ?? 'x'}-${i}`} c={c} />
        ))}
      </div>
    </Section>
  );
}

/** Award facts as a compact definition list — only the rows we actually know. */
function AwardFacts({ award }: { award: NonNullable<ScholarshipResearch['award']> }) {
  const rows: [string, string | undefined][] = [
    ['Amount', award.amount],
    ['Renewable', award.renewable],
    ['How many awarded', award.numberAwarded],
    ['Duration', award.duration],
    ['Stacks with other aid', award.stackable],
  ];
  const known = rows.filter((r): r is [string, string] => Boolean(r[1]));
  if (known.length === 0) return null;
  return (
    <Section title="The award">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {known.map(([label, value]) => (
          <div key={label} className="flex gap-2 text-sm">
            <dt className="shrink-0 text-ink-500">{label}:</dt>
            <dd className="font-medium text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** The odds block — the part families ask for first and the part most likely to be soft, so the
 *  narrative estimate is given as much room as the badge. */
function Odds({ odds }: { odds: NonNullable<ScholarshipResearch['odds']> }) {
  const c = odds.competitiveness;
  return (
    <Card className="space-y-2 border-secondary-200 bg-secondary-50">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink-800">Your odds</h3>
        {c ? <Badge tone={COMPETITIVENESS_TONE[c]}>{COMPETITIVENESS_LABEL[c]}</Badge> : null}
      </div>
      {odds.estimate ? <p className="text-sm text-ink-700">{odds.estimate}</p> : null}
      {odds.selectionRate || odds.applicantPool ? (
        <div className="flex flex-col gap-1 text-sm text-ink-600">
          {odds.selectionRate ? (
            <p>
              <span className="text-ink-500">Selection rate: </span>
              {odds.selectionRate}
            </p>
          ) : null}
          {odds.applicantPool ? (
            <p>
              <span className="text-ink-500">Who applies: </span>
              {odds.applicantPool}
            </p>
          ) : null}
        </div>
      ) : null}
      {odds.whatSetsWinnersApart?.length ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">What sets winners apart</p>
          <BulletList items={odds.whatSetsWinnersApart} />
        </div>
      ) : null}
    </Card>
  );
}

export function ResearchView({ research }: { research: ScholarshipResearch }) {
  const applyUrl = safeHref(research.applicationUrl);
  return (
    <div className="space-y-4">
      {research.summary ? (
        <Card className="space-y-2">
          {research.summary.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="text-sm leading-relaxed text-ink-700">
              {para}
            </p>
          ))}
        </Card>
      ) : null}

      {research.odds ? <Odds odds={research.odds} /> : null}

      {research.award ? (
        <Card>
          <AwardFacts award={research.award} />
        </Card>
      ) : null}

      {research.howToWin?.length ? (
        <Card>
          <Section title="How to win it">
            <PointList items={research.howToWin} />
          </Section>
        </Card>
      ) : null}

      {research.whatToExpect?.length ? (
        <Card>
          <Section title="What to expect">
            <PointList items={research.whatToExpect} />
          </Section>
        </Card>
      ) : null}

      {research.applicationSteps?.length || research.requiredMaterials?.length || applyUrl ? (
        <Card className="space-y-4">
          {research.applicationSteps?.length ? (
            <Section title="How to apply">
              <PointList items={research.applicationSteps} numbered />
            </Section>
          ) : null}
          {research.requiredMaterials?.length ? (
            <Section title="What you'll need">
              <BulletList items={research.requiredMaterials} />
            </Section>
          ) : null}
          {applyUrl ? (
            <a
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
              href={applyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Go to the application <Icon name="chevron-right" size={14} />
            </a>
          ) : null}
        </Card>
      ) : null}

      {research.deadlines?.length ? (
        <Card>
          <Section title="Dates that matter">
            <ul className="space-y-1.5">
              {research.deadlines.map((d, i) => (
                <li key={`${d.label}-${i}`} className="flex items-start gap-2 text-sm">
                  <Icon name="calendar" size={15} className="mt-0.5 shrink-0 text-secondary-500" />
                  <span>
                    <span className="font-medium text-ink-900">{d.label}</span>
                    {d.date ? <span className="text-ink-700"> — {d.date}</span> : null}
                    {d.detail ? <span className="text-ink-500"> {d.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </Card>
      ) : null}

      {research.contacts?.length || research.staff?.length ? (
        <Card className="space-y-4">
          {research.contacts?.length ? <People title="Who to contact" people={research.contacts} /> : null}
          {research.staff?.length ? <People title="Who runs it" people={research.staff} /> : null}
        </Card>
      ) : null}

      {research.tips?.length || research.redFlags?.length ? (
        <Card className="space-y-4">
          {research.tips?.length ? (
            <Section title="Tips">
              <BulletList items={research.tips} />
            </Section>
          ) : null}
          {research.redFlags?.length ? (
            <Section title="Common mistakes">
              <ul className="space-y-1 text-sm text-ink-700">
                {research.redFlags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Icon name="warning" size={15} className="mt-0.5 shrink-0 text-error-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-2">
        {research.sources?.length ? (
          <Section title="Sources">
            <ul className="space-y-1 text-sm">
              {research.sources.map((s, i) => {
                const href = safeHref(s.url);
                return (
                  <li key={i} className="truncate">
                    {href ? (
                      <a className="text-primary-600 hover:underline" href={href} target="_blank" rel="noreferrer">
                        {s.title ?? s.url}
                      </a>
                    ) : (
                      <span className="text-ink-600">{s.title ?? s.url}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}
        <p className="text-[11px] text-ink-400">
          AI research{research.asOf ? `, reflecting ${research.asOf}` : ''} — amounts, deadlines, and staff change.
          Confirm anything you’re about to act on with the school before you rely on it.
        </p>
      </Card>
    </div>
  );
}
