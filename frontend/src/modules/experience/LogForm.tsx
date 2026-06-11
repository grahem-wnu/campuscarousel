import { useState, type FormEvent } from 'react';
import { useAuth } from '../../shared/shell';
import { Button, DateField, Field, Input, Select, Textarea, TextField, useToast } from '../../shared/ui';
import { createExperience } from './api';
import { canSetPrivate } from './logic';
import type { ExperienceEntry, ExperienceInput, Visibility } from './types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface LogFormProps {
  /** Facilities seen on prior entries, to offer as quick-pick suggestions. */
  facilities?: string[];
  onCreated?: (entry: ExperienceEntry) => void;
  onCancel?: () => void;
}

/**
 * Log experience-hours form. The Private toggle is offered only to Keira (student role); the server
 * enforces the same rule off the JWT, so this is a UX nicety, not the security boundary.
 */
export function LogForm({ facilities = [], onCreated, onCancel }: LogFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const allowPrivate = canSetPrivate(user?.role);

  const [date, setDate] = useState(todayIso());
  const [facility, setFacility] = useState('');
  const [department, setDepartment] = useState('');
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorTitle, setSupervisorTitle] = useState('');
  const [supervisorContact, setSupervisorContact] = useState('');
  const [hours, setHours] = useState('');
  const [dutiesText, setDutiesText] = useState('');
  const [patientInteraction, setPatientInteraction] = useState(false);
  const [reflection, setReflection] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('family');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!facility.trim()) {
      toast.error('Which facility were you at?');
      return;
    }
    const hoursNum = Number(hours);
    if (!hours.trim() || Number.isNaN(hoursNum) || hoursNum < 0) {
      toast.error('Enter the hours as a non-negative number.');
      return;
    }
    setSaving(true);
    try {
      const input: ExperienceInput = {
        date,
        facility: facility.trim(),
        hours: hoursNum,
        department: department.trim() || undefined,
        supervisorName: supervisorName.trim() || undefined,
        supervisorTitle: supervisorTitle.trim() || undefined,
        supervisorContact: supervisorContact.trim() || undefined,
        duties: dutiesText
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        patientInteraction,
        reflection: reflection.trim() || undefined,
        visibility: allowPrivate ? visibility : 'family',
      };
      const created = await createExperience(input);
      toast.success('ExperienceEntry hours logged.');
      onCreated?.(created);
      // Reset the volatile fields for a quick second entry; keep facility/department.
      setHours('');
      setDutiesText('');
      setReflection('');
      setPatientInteraction(false);
      setVisibility('family');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField label="Date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <TextField
          label="Hours"
          type="number"
          min={0}
          step="0.25"
          required
          placeholder="e.g. 4"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Facility" required>
          <Input
            list="clinical-facilities"
            placeholder="e.g. Memorial Hospital"
            value={facility}
            onChange={(e) => setFacility(e.target.value)}
          />
          {facilities.length > 0 ? (
            <datalist id="clinical-facilities">
              {facilities.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          ) : null}
        </Field>
        <TextField
          label="Department"
          placeholder="e.g. Emergency, ICU, Pediatrics"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField
          label="Supervisor"
          placeholder="Name"
          value={supervisorName}
          onChange={(e) => setSupervisorName(e.target.value)}
        />
        <TextField
          label="Title"
          placeholder="e.g. Supervisor, Manager"
          value={supervisorTitle}
          onChange={(e) => setSupervisorTitle(e.target.value)}
        />
        <TextField
          label="Contact"
          placeholder="Email or phone"
          value={supervisorContact}
          onChange={(e) => setSupervisorContact(e.target.value)}
        />
      </div>

      <TextField
        label="Duties"
        hint="Comma-separated — what you did (e.g. vitals, charting, patient transport)."
        value={dutiesText}
        onChange={(e) => setDutiesText(e.target.value)}
      />

      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-surface-border text-primary-600 focus:ring-primary-500"
          checked={patientInteraction}
          onChange={(e) => setPatientInteraction(e.target.checked)}
        />
        Direct patient interaction
      </label>

      <Field label="Reflection" hint="Optional — what you observed or learned.">
        <Textarea rows={3} value={reflection} onChange={(e) => setReflection(e.target.value)} />
      </Field>

      {allowPrivate ? (
        <Field label="Visibility" hint="Private entries are visible only to you.">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            <option value="family">Family — visible to your family</option>
            <option value="private">Private — only you</option>
          </Select>
        </Field>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving} icon="plus">
          Log hours
        </Button>
      </div>
    </form>
  );
}
