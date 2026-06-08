import { useState } from 'react';
import { Badge, Button, Card, Modal, Spinner, useToast } from '../../shared/ui';
import { recommenderBrief } from './api';
import { slotLabel } from './logic';
import type { Contact, RecommendersResponse, RecommenderSlot } from './types';

/** Recommendation strategy board: the four slots + unassigned, coverage gaps, and a per-contact
 *  AI recommender brief (surfaced into application-central's board once that lands). */
export function RecommenderBoard({ data, loading }: { data: RecommendersResponse | null; loading: boolean }) {
  const toast = useToast();
  const [briefFor, setBriefFor] = useState<Contact | null>(null);
  const [brief, setBrief] = useState<string>('');
  const [briefLoading, setBriefLoading] = useState(false);

  async function openBrief(c: Contact): Promise<void> {
    setBriefFor(c);
    setBrief('');
    setBriefLoading(true);
    try {
      setBrief(await recommenderBrief(c.contactId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate the brief.');
      setBriefFor(null);
    } finally {
      setBriefLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="flex justify-center py-8">
        <Spinner />
      </Card>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-3">
      {data.gaps.length > 0 ? (
        <Card flush className="p-3">
          <p className="text-sm text-ink-600">
            Still need a recommender for:{' '}
            {data.gaps.map((g: RecommenderSlot) => (
              <Badge key={g} tone="warn" className="ml-1">
                {slotLabel(g)}
              </Badge>
            ))}
          </p>
        </Card>
      ) : (
        <Card flush className="p-3">
          <p className="text-sm text-success-700">All four recommender slots are covered. 🎉</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.groups.map((group) => (
          <Card key={group.slot}>
            <h3 className="font-semibold text-ink-900">{slotLabel(group.slot)}</h3>
            {group.contacts.length === 0 ? (
              <p className="mt-1 text-sm text-ink-400">No one assigned yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {group.contacts.map((c) => (
                  <li key={c.contactId} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink-700">
                      {c.name}
                      {c.organization ? <span className="text-ink-400"> · {c.organization}</span> : null}
                    </span>
                    <Button size="sm" variant="ghost" icon="chat" onClick={() => void openBrief(c)}>
                      Brief
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Modal open={Boolean(briefFor)} onClose={() => setBriefFor(null)} title={`Recommender brief — ${briefFor?.name ?? ''}`}>
        {briefLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-ink-700">{brief}</p>
        )}
      </Modal>
    </div>
  );
}
