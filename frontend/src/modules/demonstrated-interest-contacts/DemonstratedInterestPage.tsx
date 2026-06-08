import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Tabs,
  type TabItem,
} from '../../shared/ui';
import { listColleges, listContacts, listFollowUps, listRecommenders } from './api';
import { ContactForm } from './ContactForm';
import { RecommenderBoard } from './RecommenderBoard';
import { TouchpointsPanel } from './TouchpointsPanel';
import { filterContacts } from './logic';
import type {
  CollegeRef,
  Contact,
  FollowUp,
  RecommendersResponse,
  Relationship,
} from './types';
import { RELATIONSHIPS } from './types';
import { touchpointLabel } from './logic';

type TabId = 'network' | 'follow-ups' | 'touchpoints';

/** Demonstrated Interest + Contact Network — standalone hub: the contact rolodex + recommender
 *  board, the cross-college follow-ups queue, and per-college touchpoint logs. */
export default function DemonstratedInterestPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recommenders, setRecommenders] = useState<RecommendersResponse | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [colleges, setColleges] = useState<CollegeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>('network');
  const [q, setQ] = useState('');
  const [relationship, setRelationship] = useState<Relationship | ''>('');
  const [collegeFilter, setCollegeFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [tpCollege, setTpCollege] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The college list comes from college-hub; tolerate its absence so the network still loads.
      const [contactsRes, recommendersRes, followUpsRes, collegesRes] = await Promise.all([
        listContacts(),
        listRecommenders(),
        listFollowUps(),
        listColleges().catch(() => [] as CollegeRef[]),
      ]);
      setContacts(contactsRes);
      setRecommenders(recommendersRes);
      setFollowUps(followUpsRes);
      setColleges(collegesRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your network.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Default the touchpoint college picker to the first college once they load — kept out of `load`
  // so changing the picker doesn't re-fetch the whole page (TouchpointsPanel loads its own data).
  useEffect(() => {
    setTpCollege((cur) => cur || colleges[0]?.collegeId || '');
  }, [colleges]);

  const visibleContacts = useMemo(
    () => filterContacts(contacts, { q, relationship, collegeId: collegeFilter }),
    [contacts, q, relationship, collegeFilter],
  );
  const collegeName = (id?: string) => colleges.find((c) => c.collegeId === id)?.name;

  const tabs: TabItem[] = [
    { id: 'network', label: 'Network', count: contacts.length },
    { id: 'follow-ups', label: 'Follow-ups', count: followUps.length },
    { id: 'touchpoints', label: 'Touchpoints' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Contacts &amp; Demonstrated Interest</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Your network of mentors and recommenders, and every touchpoint with your target schools.
          </p>
        </div>
        <Button icon="plus" onClick={() => setAdding(true)}>
          Add contact
        </Button>
      </header>

      <Tabs items={tabs} value={tab} onChange={(id) => setTab(id as TabId)} />

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === 'network' ? (
        <div className="space-y-5">
          <Card flush className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Search" className="min-w-[12rem] flex-1">
                <Input placeholder="Name, role, organization…" value={q} onChange={(e) => setQ(e.target.value)} />
              </Field>
              <Field label="Relationship">
                <Select value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship | '')}>
                  <option value="">All</option>
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="College">
                <Select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)}>
                  <option value="">All</option>
                  {colleges.map((c) => (
                    <option key={c.collegeId} value={c.collegeId}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          {contacts.length === 0 ? (
            <EmptyState
              icon="contacts"
              title="Start your contact network"
              description="Add the nurses, teachers, counselors, and mentors who can become recommenders and advocates."
              action={<Button icon="plus" onClick={() => setAdding(true)}>Add your first contact</Button>}
            />
          ) : visibleContacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">No contacts match your filters.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleContacts.map((c) => (
                <Card key={c.contactId} interactive onClick={() => setEditing(c)}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-ink-900">{c.name}</h3>
                    {c.isPotentialRecommender ? <Badge tone="success">Recommender</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {[c.role, c.organization].filter(Boolean).join(' · ') || c.relationship || '—'}
                  </p>
                  {c.linkedCollegeId ? <p className="mt-1 text-xs text-ink-400">{collegeName(c.linkedCollegeId) ?? 'Linked college'}</p> : null}
                </Card>
              ))}
            </div>
          )}

          <section>
            <h2 className="mb-2 text-lg font-semibold text-ink-900">Recommendation board</h2>
            <RecommenderBoard data={recommenders} loading={false} />
          </section>
        </div>
      ) : tab === 'follow-ups' ? (
        followUps.length === 0 ? (
          <EmptyState icon="check" title="No pending follow-ups" description="Touchpoints needing a follow-up show up here, soonest first." />
        ) : (
          <div className="space-y-2">
            {followUps.map((f) => (
              <Card key={`${f.collegeId}-${f.touchpointId}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{touchpointLabel(f.type)}</Badge>
                  <span className="font-medium text-ink-800">{f.collegeName}</span>
                  {f.followUpDate ? <Badge tone="warn">by {f.followUpDate}</Badge> : null}
                </div>
                {f.description ? <p className="mt-1 text-sm text-ink-700">{f.description}</p> : null}
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {colleges.length === 0 ? (
            <EmptyState icon="school" title="No colleges yet" description="Add target colleges in College Hub to start logging touchpoints." />
          ) : (
            <>
              <Field label="College">
                <Select value={tpCollege} onChange={(e) => setTpCollege(e.target.value)}>
                  {colleges.map((c) => (
                    <option key={c.collegeId} value={c.collegeId}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {tpCollege ? <TouchpointsPanel key={tpCollege} collegeId={tpCollege} /> : null}
            </>
          )}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a contact">
        <ContactForm colleges={colleges} onSaved={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} />
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit contact">
        {editing ? (
          <ContactForm contact={editing} colleges={colleges} onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} />
        ) : null}
      </Modal>
    </div>
  );
}
