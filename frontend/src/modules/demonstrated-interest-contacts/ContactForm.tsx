import { useState, type FormEvent } from 'react';
import { Button, Field, Select, Textarea, TextField, useToast } from '../../shared/ui';
import { createContact, updateContact } from './api';
import { slotLabel } from './logic';
import { RECOMMENDER_SLOTS, RELATIONSHIPS, type CollegeRef, type Contact, type ContactInput, type Relationship, type RecommenderSlot } from './types';

export interface ContactFormProps {
  contact?: Contact;
  colleges: CollegeRef[];
  onSaved?: (c: Contact) => void;
  onCancel?: () => void;
}

/** Add/edit a contact in the network. */
export function ContactForm({ contact, colleges, onSaved, onCancel }: ContactFormProps) {
  const toast = useToast();
  const editing = Boolean(contact);

  const [name, setName] = useState(contact?.name ?? '');
  const [role, setRole] = useState(contact?.role ?? '');
  const [organization, setOrganization] = useState(contact?.organization ?? '');
  const [relationship, setRelationship] = useState<Relationship | ''>(contact?.relationship ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [linkedCollegeId, setLinkedCollegeId] = useState(contact?.linkedCollegeId ?? '');
  const [howMet, setHowMet] = useState(contact?.howMet ?? '');
  const [isRec, setIsRec] = useState(Boolean(contact?.isPotentialRecommender));
  const [slot, setSlot] = useState<RecommenderSlot | ''>(contact?.recommenderSlot ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Give the contact a name.');
      return;
    }
    setSaving(true);
    try {
      const input: ContactInput = {
        name: name.trim(),
        role: role.trim() || undefined,
        organization: organization.trim() || undefined,
        relationship: relationship || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        linkedCollegeId: linkedCollegeId || undefined,
        howMet: howMet.trim() || undefined,
        isPotentialRecommender: isRec,
        recommenderSlot: isRec && slot ? slot : undefined,
      };
      const saved = contact ? await updateContact(contact.contactId, input) : await createContact(input);
      toast.success(editing ? 'Contact updated.' : 'Contact added.');
      onSaved?.(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the contact.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Role" placeholder="e.g. AP Bio teacher" value={role} onChange={(e) => setRole(e.target.value)} />
        <TextField label="Organization" value={organization} onChange={(e) => setOrganization(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Relationship">
          <Select value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship | '')}>
            <option value="">—</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Linked college">
          <Select value={linkedCollegeId} onChange={(e) => setLinkedCollegeId(e.target.value)}>
            <option value="">—</option>
            {colleges.map((c) => (
              <option key={c.collegeId} value={c.collegeId}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <Field label="How you met" hint="Optional context for a future recommender brief.">
        <Textarea rows={2} value={howMet} onChange={(e) => setHowMet(e.target.value)} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" checked={isRec} onChange={(e) => setIsRec(e.target.checked)} />
        Potential recommender
      </label>
      {isRec ? (
        <Field label="Recommender slot">
          <Select value={slot} onChange={(e) => setSlot(e.target.value as RecommenderSlot | '')}>
            <option value="">Unassigned</option>
            {RECOMMENDER_SLOTS.map((s) => (
              <option key={s} value={s}>
                {slotLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving} icon={editing ? 'check' : 'plus'}>
          {editing ? 'Save' : 'Add contact'}
        </Button>
      </div>
    </form>
  );
}
