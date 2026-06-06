import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { DateField } from '../../shared/ui';
import { getSummary, listActivities } from './api';
import { ACTIVITY_CREATED_EVENT, QuickAddForm } from './QuickAddForm';
import { CalendarView } from './CalendarView';
import { SummaryView } from './SummaryView';
import { TimelineView } from './TimelineView';
import { WeeklyReflectionCard } from './WeeklyReflectionCard';
import { CATEGORY_META, filterBySearch } from './logic';
import { CATEGORIES, type Activity, type ActivitySummary, type Category } from './types';

type TabId = 'timeline' | 'calendar' | 'summary';

const now = new Date();

/** Activity Journal — timeline / calendar / summary, quick-add, and the weekly reflection. */
export default function JournalPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>('timeline');
  const [category, setCategory] = useState<Category | ''>('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acts, sum] = await Promise.all([
        listActivities({ category: category || undefined, from: from || undefined, to: to || undefined }),
        getSummary(),
      ]);
      setActivities(acts);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your journal.');
    } finally {
      setLoading(false);
    }
  }, [category, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when an entry is created anywhere (in-page modal or the app-wide FAB).
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener(ACTIVITY_CREATED_EVENT, handler);
    return () => window.removeEventListener(ACTIVITY_CREATED_EVENT, handler);
  }, [load]);

  const visible = useMemo(() => filterBySearch(activities, search), [activities, search]);

  const hasFilters = Boolean(category || search || from || to);
  const tabs: TabItem[] = [
    { id: 'timeline', label: 'Timeline', count: visible.length },
    { id: 'calendar', label: 'Calendar' },
    { id: 'summary', label: 'Summary' },
  ];

  function clearFilters(): void {
    setCategory('');
    setSearch('');
    setFrom('');
    setTo('');
  }

  function stepMonth(delta: number): void {
    const d = new Date(Date.UTC(calYear, calMonth + delta, 1));
    setCalYear(d.getUTCFullYear());
    setCalMonth(d.getUTCMonth());
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Activity Journal</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Every meaningful thing you do — volunteering, clinical hours, leadership, reflections.
          </p>
        </div>
        <Button icon="plus" onClick={() => setShowAdd(true)}>
          Log activity
        </Button>
      </header>

      <WeeklyReflectionCard onSaved={() => void load()} />

      <Card flush className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" className="min-w-[12rem] flex-1">
            <Input
              placeholder="Search title, tags, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
              <option value="">All</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].label}
                </option>
              ))}
            </Select>
          </Field>
          <DateField label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <DateField label="To" value={to} onChange={(e) => setTo(e.target.value)} />
          {hasFilters ? (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>
      </Card>

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
      ) : activities.length === 0 ? (
        <EmptyState
          icon="book"
          title={hasFilters ? 'No entries match your filters' : 'Start your journal'}
          description={
            hasFilters
              ? 'Try clearing the filters to see everything.'
              : 'Log volunteering, clinical hours, leadership, awards — anything meaningful. It all becomes the story behind your application.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button icon="plus" onClick={() => setShowAdd(true)}>
                Log your first activity
              </Button>
            )
          }
        />
      ) : tab === 'timeline' ? (
        visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500">No entries match your search.</p>
        ) : (
          <TimelineView activities={visible} />
        )
      ) : tab === 'calendar' ? (
        <CalendarView
          activities={visible}
          year={calYear}
          month={calMonth}
          onPrev={() => stepMonth(-1)}
          onNext={() => stepMonth(1)}
        />
      ) : summary ? (
        <SummaryView summary={summary} />
      ) : null}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Log an activity">
        <QuickAddForm
          onCreated={() => {
            setShowAdd(false);
            void load();
          }}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>
    </div>
  );
}
