import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Field, Select, Spinner, TextField, useToast } from '../../shared/ui';
import { getSettings, putSettings, sendTest } from './api';
import { dayName, localHourFromUtc, utcHourFromLocal, localHourLabel, validateRecipients } from './logic';
import type { ReminderRecipient, ReminderSettingsInput } from './types';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAYS = Array.from({ length: 7 }, (_, d) => d);

export default function RemindersPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<ReminderSettingsInput | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getSettings();
      setSettings({
        enabled: s.enabled,
        cadence: s.cadence,
        sendHourUTC: s.sendHourUTC,
        weeklyDayOfWeek: s.weeklyDayOfWeek,
        horizonDays: s.horizonDays,
        recipients: s.recipients,
      });
      setLastSentAt(s.lastSentAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reminder settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(p: Partial<ReminderSettingsInput>) {
    setSettings((s) => (s ? { ...s, ...p } : s));
  }
  function updateRecipient(i: number, p: Partial<ReminderRecipient>) {
    setSettings((s) =>
      s ? { ...s, recipients: s.recipients.map((r, idx) => (idx === i ? { ...r, ...p } : r)) } : s,
    );
  }
  function addRecipient() {
    patch({ recipients: [...(settings?.recipients ?? []), { label: '', email: '' }] });
  }
  function removeRecipient(i: number) {
    patch({ recipients: (settings?.recipients ?? []).filter((_, idx) => idx !== i) });
  }

  async function save() {
    if (!settings) return;
    const problems = validateRecipients(settings.recipients);
    if (problems.length > 0) {
      toast.error(problems[0]!.message);
      return;
    }
    setSaving(true);
    try {
      const saved = await putSettings(settings);
      setLastSentAt(saved.lastSentAt);
      toast.success('Reminder settings saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await sendTest();
      toast.success(`Test digest sent to ${res.sent} recipient${res.sent === 1 ? '' : 's'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send a test email.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-ink-900">Email Reminders</h1>
        <p className="text-sm text-ink-600">
          A digest of upcoming and overdue deadlines, emailed automatically on the schedule you set.
        </p>
      </header>

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading || !settings ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-800">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
                className="h-4 w-4 rounded border-surface-border text-primary-600"
              />
              Send the email digest
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="How often">
                <Select
                  value={settings.cadence}
                  onChange={(e) => patch({ cadence: e.target.value as ReminderSettingsInput['cadence'] })}
                >
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                </Select>
              </Field>

              {settings.cadence === 'weekly' ? (
                <Field label="Day of week">
                  <Select
                    value={settings.weeklyDayOfWeek}
                    onChange={(e) => patch({ weeklyDayOfWeek: Number(e.target.value) })}
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {dayName(d)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <Field label="Send time" hint="When the digest goes out, in your local time.">
                <Select
                  value={localHourFromUtc(settings.sendHourUTC)}
                  onChange={(e) => patch({ sendHourUTC: utcHourFromLocal(Number(e.target.value)) })}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {localHourLabel(h)}
                    </option>
                  ))}
                </Select>
              </Field>

              <TextField
                label="Look ahead (days)"
                hint="How far out to include upcoming deadlines."
                type="number"
                min={1}
                max={365}
                value={settings.horizonDays}
                onChange={(e) => patch({ horizonDays: Number(e.target.value) })}
              />
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-800">Recipients</h2>
              <Button size="sm" variant="outline" icon="plus" onClick={addRecipient}>
                Add
              </Button>
            </div>
            {settings.recipients.length === 0 ? (
              <p className="text-sm text-ink-500">No recipients yet — add an email to start the digest.</p>
            ) : (
              <div className="space-y-3">
                {settings.recipients.map((r, i) => (
                  <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-md bg-surface-sunken p-3 sm:grid-cols-[1fr,1.4fr,auto]">
                    <TextField
                      label="Name"
                      value={r.label}
                      onChange={(e) => updateRecipient(i, { label: e.target.value })}
                    />
                    <TextField
                      label="Email"
                      type="email"
                      value={r.email}
                      onChange={(e) => updateRecipient(i, { email: e.target.value })}
                    />
                    <Button size="sm" variant="ghost" onClick={() => removeRecipient(i)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-ink-500">
              Keira&rsquo;s private journal, clinical-hours, and &ldquo;Why Nursing&rdquo; entries are
              never included in any reminder email.
            </p>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-500">
              {lastSentAt ? `Last sent ${new Date(lastSentAt).toLocaleString()}` : 'Not sent yet.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" loading={testing} onClick={() => void test()}>
                Send test
              </Button>
              <Button loading={saving} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
