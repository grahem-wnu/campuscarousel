import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, Select, Spinner, useToast } from "../../shared/ui";
import { useActiveStudent, useAuth, type Student } from "../../shared/shell";
import { resetStudent } from "../onboarding/api";
import {
  RELATIONSHIP_LABELS,
  createStudent,
  deleteMember,
  deleteStudent,
  getStudentProfile,
  inviteMember,
  listMembers,
  putStudentProfile,
  updateMember,
  updateStudent,
  type FamilyMember,
  type MemberAccessLevel,
  type MemberRelationship,
} from "./api";

/**
 * Family management (parents/admins). Today it manages the **children** in the family — the roster
 * that drives the student switcher and scopes every child's data. Each child has their own complete
 * record (activities, colleges, scholarships, …). The "Parents & access" section is a placeholder for
 * co-parent invites (next).
 */
export default function FamilyPage() {
  const toast = useToast();
  const { students, activeStudentId, setActiveStudentId, reload } = useActiveStudent();

  const [name, setName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter the child's name.");
      return;
    }
    const year = gradYear ? Number(gradYear) : undefined;
    if (gradYear && (!year || year < 2000 || year > 2100)) {
      toast.error("Enter a valid graduation year (e.g. 2030).");
      return;
    }
    setBusy(true);
    try {
      const created = await createStudent({ name: trimmed, graduationYear: year });
      setName("");
      setGradYear("");
      await reload();
      // First child added → make them the active student so the app has data to show.
      if (students.length === 0) setActiveStudentId(created.studentId);
      toast.success(`Added ${created.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the child.");
    } finally {
      setBusy(false);
    }
  }

  const active = students.filter((s) => s.status === "active");
  const archived = students.filter((s) => s.status === "archived");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Family</h1>
        <p className="mt-1 text-sm text-ink-500">
          Manage the children in your family. Each child has their own journey — switch between them from
          the menu in the top bar.
        </p>
      </header>

      <Card>
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="font-semibold text-ink-800">Children</h2>
          <Badge tone="neutral">{active.length}</Badge>
        </div>

        {students.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon="user"
              title="No children yet"
              description="Add your first child to start tracking their college journey."
            />
          </div>
        ) : (
          <ul className="divide-y divide-surface-border">
            {active.map((s) => (
              <StudentRow
                key={s.studentId}
                student={s}
                isActive={s.studentId === activeStudentId}
                onView={() => setActiveStudentId(s.studentId)}
                onEdit={() => setEditing(s)}
              />
            ))}
            {archived.map((s) => (
              <StudentRow key={s.studentId} student={s} isActive={false} onEdit={() => setEditing(s)} />
            ))}
          </ul>
        )}

        {/* Add child */}
        <div className="flex flex-col gap-3 border-t border-surface-border px-4 py-4 sm:flex-row sm:items-end">
          <Field label="Child's name" className="flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Keira"
              maxLength={120}
            />
          </Field>
          <Field label="Graduation year" className="sm:w-44">
            <Input
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="2030"
              inputMode="numeric"
              maxLength={4}
            />
          </Field>
          <Button onClick={add} disabled={busy}>
            <Icon name="plus" size={16} /> Add child
          </Button>
        </div>
      </Card>

      <AcademicFocusCard />

      <MembersCard />

      {editing && (
        <EditStudentModal
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function StudentRow({
  student,
  isActive,
  onView,
  onEdit,
}: {
  student: Student;
  isActive: boolean;
  onView?: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700">
        <Icon name="user" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink-800">
          {student.name}
          {student.status === "archived" && (
            <Badge tone="neutral" className="ml-2 align-middle">
              Archived
            </Badge>
          )}
          {isActive && (
            <Badge tone="primary" className="ml-2 align-middle">
              Viewing
            </Badge>
          )}
        </p>
        {student.graduationYear && (
          <p className="text-xs text-ink-500">Class of {student.graduationYear}</p>
        )}
      </div>
      {onView && !isActive && student.status === "active" && (
        <Button variant="ghost" size="sm" onClick={onView}>
          View
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${student.name}`}>
        Edit
      </Button>
    </li>
  );
}

function EditStudentModal({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState(student.name);
  const [gradYear, setGradYear] = useState(student.graduationYear ? String(student.graduationYear) : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name can't be empty.");
      return;
    }
    const year = gradYear ? Number(gradYear) : undefined;
    if (gradYear && (!year || year < 2000 || year > 2100)) {
      toast.error("Enter a valid graduation year.");
      return;
    }
    setBusy(true);
    try {
      await updateStudent(student.studentId, { name: trimmed, graduationYear: year });
      toast.success("Saved.");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  async function toggleArchive() {
    setBusy(true);
    try {
      await updateStudent(student.studentId, { status: student.status === "active" ? "archived" : "active" });
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${student.name} from the family roster? Their saved data is kept.`)) return;
    setBusy(true);
    try {
      await deleteStudent(student.studentId);
      toast.success(`Removed ${student.name}.`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${student.name}`}>
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Graduation year">
          <Input
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="2030"
            inputMode="numeric"
            maxLength={4}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={toggleArchive} disabled={busy}>
              {student.status === "active" ? "Archive" : "Restore"}
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              Remove
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Intended-major options. Each value must resolve to a backend major pack (backend/shared/packs):
 * the value is matched against each pack's key/aliases, so keep these strings pack-recognizable.
 * Source of truth for the packs themselves is the backend registry — add a pack there, add it here.
 */
const MAJOR_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "Nursing", label: "Nursing (BSN)" },
  { value: "Computer Science", label: "Computer Science" },
  { value: "Pre-health", label: "Pre-med / Pre-health" },
  { value: "Business", label: "Business" },
  { value: "Engineering", label: "Engineering" },
  { value: "Education", label: "Education / Teaching" },
  { value: "Psychology", label: "Psychology / Mental health" },
  { value: "Neuroscience", label: "Neuroscience" },
  // Stored as "Construction" (not "Construction Management") so the "management" token doesn't also
  // activate the Business pack; the backend construction pack matches the "construction" alias.
  { value: "Construction", label: "Construction Management" },
  { value: "Architecture", label: "Architecture" },
];

/**
 * Academic focus for the ACTIVE child (the switcher's selection). Sets the intended major, which drives
 * the AI's college matching, benchmarks, and copy — this is what genericizes the app beyond nursing.
 * A dropdown of the available major packs (free text invited unrecognized values the backend rejected).
 * Scoped to the active student because /profile resolves to whoever the X-Student-Id header names.
 */
function AcademicFocusCard() {
  const toast = useToast();
  const { user } = useAuth();
  const { activeStudent, activeStudentId } = useActiveStudent();
  const [major, setMajor] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function reset() {
    const who = activeStudent?.name ?? "this student";
    if (
      !window.confirm(
        `Reset ${who}'s setup? This clears their major, AI-built goals, and AI-discovered colleges and re-runs onboarding. GPA, courses, journal, and any colleges you added yourself are kept.`,
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      await resetStudent();
      toast.success("Reset — starting onboarding.");
      window.dispatchEvent(new Event("open-onboarding"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset.");
    } finally {
      setResetting(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await getStudentProfile();
      setMajor((p.intendedMajors ?? [])[0] ?? "");
    } catch {
      setMajor("");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the active child changes (the data is per-child).
  useEffect(() => {
    void load();
  }, [load, activeStudentId]);

  async function save() {
    setBusy(true);
    try {
      await putStudentProfile({ intendedMajors: major ? [major] : [] });
      toast.success("Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!activeStudentId) return null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
        <h2 className="font-semibold text-ink-800">
          Academic focus{activeStudent ? ` — ${activeStudent.name}` : ""}
        </h2>
        {user?.role === "admin" ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={reset} loading={resetting} disabled={resetting}>
              Reset setup
            </Button>
          </div>
        ) : null}
      </div>
      <div className="p-4">
        {loading ? (
          <Spinner size={20} />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              label="Intended major"
              className="flex-1"
              hint="Drives the AI's college matching, exam prep, certifications, and interview questions."
            >
              <Select value={major} onChange={(e) => setMajor(e.target.value)}>
                <option value="">Undeclared / not sure yet</option>
                {MAJOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={save} disabled={busy}>
              Save
            </Button>
          </div>
        )}
        {user?.role === "admin" ? (
          <p className="mt-3 text-xs text-ink-400">
            &ldquo;Reset setup&rdquo; clears the major, AI-built goals, and discovered colleges and re-runs onboarding. GPA, courses, and journal are kept.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

const RELATIONSHIPS: MemberRelationship[] = [
  "parent",
  "grandparent",
  "aunt-uncle",
  "sibling",
  "family-friend",
  "counselor",
  "mentor",
  "child",
  "other",
];

/** Parents & access: everyone with a login to the family — guardians + the wider support circle. */
function MembersCard() {
  const toast = useToast();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMembers((await listMembers()).members);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load members.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(m: FamilyMember) {
    if (!window.confirm(`Remove ${m.displayName || m.email}'s access? They'll no longer be able to sign in.`)) return;
    try {
      await deleteMember(m.userId);
      toast.success("Access removed.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove.");
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="font-semibold text-ink-800">Parents &amp; access</h2>
        <Button size="sm" onClick={() => setInviting(true)}>
          <Icon name="plus" size={15} /> Invite
        </Button>
      </div>

      {loading ? (
        <div className="p-4">
          <Spinner size={20} />
        </div>
      ) : members.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon="contacts"
            title="No one else yet"
            description="Invite a co-parent, grandparent, counselor, or family friend. Managers can edit; viewers can follow along."
          />
        </div>
      ) : (
        <ul className="divide-y divide-surface-border">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-100 text-secondary-700">
                <Icon name="user" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-800">{m.displayName || m.email}</p>
                <p className="truncate text-xs text-ink-500">
                  {RELATIONSHIP_LABELS[m.relationship]} · {m.email}
                </p>
              </div>
              <Badge tone={m.accessLevel === "manager" ? "primary" : "neutral"}>
                {m.accessLevel === "manager" ? "Manager" : "View-only"}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void remove(m)} aria-label={`Remove ${m.email}`}>
                <Icon name="close" size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {inviting && (
        <MemberFormModal
          onClose={() => setInviting(false)}
          onSaved={async () => {
            setInviting(false);
            await load();
          }}
        />
      )}
      {editing && (
        <MemberFormModal
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </Card>
  );
}

/** Invite a new member (no `member`) or edit an existing one's relationship + access level. */
function MemberFormModal({
  member,
  onClose,
  onSaved,
}: {
  member?: FamilyMember;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const editingExisting = Boolean(member);
  const [email, setEmail] = useState(member?.email ?? "");
  const [displayName, setDisplayName] = useState(member?.displayName ?? "");
  const [relationship, setRelationship] = useState<MemberRelationship>(member?.relationship ?? "grandparent");
  const [accessLevel, setAccessLevel] = useState<MemberAccessLevel>(member?.accessLevel ?? "viewer");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editingExisting && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Enter a valid email.");
      return;
    }
    setBusy(true);
    try {
      if (editingExisting && member) {
        await updateMember(member.userId, { displayName: displayName.trim() || undefined, relationship, accessLevel });
        toast.success("Updated.");
      } else {
        const created = await inviteMember({ email: email.trim(), displayName: displayName.trim() || undefined, relationship, accessLevel });
        toast.success(
          created.emailed === false
            ? `Added ${email.trim()}, but the email couldn't be sent — share their sign-in details manually.`
            : `Invited ${email.trim()} — we emailed them a sign-in link.`,
        );
      }
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editingExisting ? "Edit access" : "Invite someone"}>
      <div className="space-y-4">
        {!editingExisting && (
          <Field label="Email" hint="We'll email them a temporary password to sign in with.">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </Field>
        )}
        <Field label="Name (optional)">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Grandma Jo" />
        </Field>
        <Field label="Relationship">
          <Select value={relationship} onChange={(e) => setRelationship(e.target.value as MemberRelationship)}>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {RELATIONSHIP_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Access" hint="Managers can edit and invite. Viewers can follow along but not change anything or see private journal entries.">
          <Select value={accessLevel} onChange={(e) => setAccessLevel(e.target.value as MemberAccessLevel)}>
            <option value="viewer">View-only</option>
            <option value="manager">Manager</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {editingExisting ? "Save" : "Send invite"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
