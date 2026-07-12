import { useState, type FormEvent } from 'react';
import { Button, DateField, Field, Input, Select, Textarea, useToast } from '../../shared/ui';
import { createVisit, updateVisit } from './api';
import type { Visit, VisitInput, VisitType, WouldAttend } from './types';
import { VISIT_TYPES, WOULD_ATTEND } from './types';
import { visitTypeLabel, wouldAttendLabel } from './logic';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const toList = (s: string): string[] =>
  s.split(',').map((x) => x.trim()).filter(Boolean);

export interface VisitFormProps {
  collegeId: string;
  visit?: Visit;
  onSaved?: (visit: Visit) => void;
  onCancel?: () => void;
}

/** Create a planned visit or fill in the post-visit debrief. Family-visible — any user may save. */
export function VisitForm({ collegeId, visit, onSaved, onCancel }: VisitFormProps) {
  const toast = useToast();
  const editing = Boolean(visit);

  const [date, setDate] = useState(visit?.date ?? todayIso());
  const [visitType, setVisitType] = useState<VisitType | ''>(visit?.visitType ?? '');
  const [attendees, setAttendees] = useState((visit?.attendees ?? []).join(', '));
  const [travelCost, setTravelCost] = useState(visit?.travelCost != null ? String(visit.travelCost) : '');
  const [wouldAttend, setWouldAttend] = useState<WouldAttend | ''>(visit?.wouldAttend ?? '');
  const [impressions, setImpressions] = useState(visit?.impressions ?? '');
  const [pros, setPros] = useState((visit?.pros ?? []).join(', '));
  const [cons, setCons] = useState((visit?.cons ?? []).join(', '));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const costNum = travelCost.trim() ? Number(travelCost) : undefined;
    if (costNum !== undefined && (Number.isNaN(costNum) || costNum < 0)) {
      toast.error('Travel cost must be a non-negative number.');
      return;
    }
    setSaving(true);
    try {
      const input: VisitInput = {
        date,
        visitType: visitType || undefined,
        attendees: toList(attendees),
        travelCost: costNum,
        wouldAttend: wouldAttend || undefined,
        impressions: impressions.trim() || undefined,
        pros: toList(pros),
        cons: toList(cons),
      };
      const saved = visit
        ? await updateVisit(collegeId, visit.visitId, input)
        : await createVisit(collegeId, input);
      toast.success(editing ? 'Visit updated.' : 'Visit planned.');
      onSaved?.(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the visit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Field label="Visit type">
          <Select value={visitType} onChange={(e) => setVisitType(e.target.value as VisitType | '')}>
            <option value="">—</option>
            {VISIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {visitTypeLabel(t)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Attendees" hint="Comma-separated.">
          <Input placeholder="e.g. Mom, Dad" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        </Field>
        <Field label="Travel cost (USD)">
          <Input
            type="number"
            min={0}
            step="1"
            placeholder="optional"
            value={travelCost}
            onChange={(e) => setTravelCost(e.target.value)}
          />
        </Field>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-surface-border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-400">
          Post-visit debrief (optional)
        </legend>
        <Field label="Impressions">
          <Textarea rows={2} value={impressions} onChange={(e) => setImpressions(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Pros" hint="Comma-separated.">
            <Input value={pros} onChange={(e) => setPros(e.target.value)} />
          </Field>
          <Field label="Cons" hint="Comma-separated.">
            <Input value={cons} onChange={(e) => setCons(e.target.value)} />
          </Field>
        </div>
        <Field label="Would attend?">
          <Select value={wouldAttend} onChange={(e) => setWouldAttend(e.target.value as WouldAttend | '')}>
            <option value="">—</option>
            {WOULD_ATTEND.map((w) => (
              <option key={w} value={w}>
                {wouldAttendLabel(w)}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving} icon={editing ? 'check' : 'plus'}>
          {editing ? 'Save visit' : 'Plan visit'}
        </Button>
      </div>
    </form>
  );
}
