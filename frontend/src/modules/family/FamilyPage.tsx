import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, Select, Spinner, useToast } from "../../shared/ui";
import { useActiveStudent, useAuth, type Student } from "../../shared/shell";
import { resetStudent } from "../onboarding/api";
import {
  RELATIONSHIP_LABELS,
  createInvite,
  createStudent,
  deleteMember,
  deleteStudent,
  getStudentProfile,
  listInvites,
  listMembers,
  putStudentProfile,
  revokeInvite,
  updateMember,
  updateStudent,
  type FamilyInviteKind,
  type FamilyMember,
  type InviteResult,
  type MemberAccessLevel,
  type MemberRelationship,
  type PendingInvite,
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
  const [invitingStudent, setInvitingStudent] = useState<Student | null>(null);

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
                onInvite={() => setInvitingStudent(s)}
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

      {invitingStudent && (
        <StudentInviteModal student={invitingStudent} onClose={() => setInvitingStudent(null)} />
      )}
    </div>
  );
}

function StudentRow({
  student,
  isActive,
  onView,
  onEdit,
  onInvite,
}: {
  student: Student;
  isActive: boolean;
  onView?: () => void;
  onEdit: () => void;
  onInvite?: () => void;
}) {
  const hasLogin = Boolean(student.loginUserId);
  return (
    // flex-wrap + a full-width action row: on a phone the buttons drop below the name instead of
    // colliding with "Class of …"; on ≥sm they sit inline. gap-y-2 spaces the wrapped row.
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
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
        {hasLogin ? (
          <p className="truncate text-xs text-ink-500">Signed in as {student.loginUserId}</p>
        ) : student.graduationYear ? (
          <p className="text-xs text-ink-500">Class of {student.graduationYear}</p>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
        {onView && !isActive && student.status === "active" && (
          <Button variant="ghost" size="sm" onClick={onView}>
            View
          </Button>
        )}
        {/* Give the child their own login. An outline button so it reads as an action, not body text.
            Once linked, we show who they signed up as instead. */}
        {onInvite && !hasLogin && student.status === "active" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onInvite}
            aria-label={`Invite ${student.name} to sign in`}
          >
            Invite to sign in
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${student.name}`}>
          Edit
        </Button>
      </div>
    </li>
  );
}

/**
 * A reusable panel that shows a freshly-minted invite: the shareable join link + the raw code, each
 * with a Copy button. The manager sends this to the invitee (there is no email — codes are shared
 * directly). Copy degrades gracefully where the clipboard API is unavailable.
 */
function InviteCodePanel({ invite }: { invite: InviteResult }) {
  const toast = useToast();
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Couldn't copy — select and copy it manually.");
    }
  }
  return (
    <div className="space-y-3">
      <Field label="Shareable link" hint="Send this to the person joining — they set their own login name and password.">
        <div className="flex items-center gap-2">
          <Input readOnly value={invite.url} onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" size="sm" onClick={() => void copy(invite.url, "Link")}>
            Copy
          </Button>
        </div>
      </Field>
      <Field label="Or share the code">
        <div className="flex items-center gap-2">
          <Input readOnly value={invite.code} className="font-mono tracking-widest" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" size="sm" onClick={() => void copy(invite.code, "Code")}>
            Copy
          </Button>
        </div>
      </Field>
    </div>
  );
}

/** Mint a "sign-in" login invite for a specific child, then show the shareable link/code. */
function StudentInviteModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);

  async function generate() {
    setBusy(true);
    try {
      setInvite(await createInvite({ kind: "student", studentId: student.studentId }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Invite ${student.name} to sign in`}>
      <div className="space-y-4">
        {invite ? (
          <>
            <p className="text-sm text-ink-600">
              Share this with {student.name}. They&rsquo;ll pick their own login name and password and get their
              own private view of their journey.
            </p>
            <InviteCodePanel invite={invite} />
            <div className="flex justify-end pt-1">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-600">
              Give {student.name} their own login so they can sign in and keep private journal entries. Their
              login is pinned to their journey only.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void generate()} loading={busy} disabled={busy}>
                Create invite link
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
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

/** Relationships offered for an adult (co-parent / viewer) invite — the "child" relationship is
 *  reserved for the per-child "Invite to sign in" flow, so it's excluded here. */
const ADULT_RELATIONSHIPS: MemberRelationship[] = RELATIONSHIPS.filter((r) => r !== "child");

/** Parents & access: everyone with a login to the family — guardians + the wider support circle. */
function MembersCard() {
  const toast = useToast();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([listMembers(), listInvites()]);
      setMembers(m.members);
      // Adult (co-parent/viewer) invites live here; per-child "sign in" invites are shown on the child row.
      setInvites(i.invites.filter((inv) => inv.kind !== "student"));
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
    if (!window.confirm(`Remove ${m.displayName || m.userId}'s access? They'll no longer be able to sign in.`)) return;
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
      ) : members.length === 0 && invites.length === 0 ? (
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
                <p className="truncate font-medium text-ink-800">{m.displayName || m.userId}</p>
                <p className="truncate text-xs text-ink-500">
                  {RELATIONSHIP_LABELS[m.relationship]}
                  {m.email ? ` · ${m.email}` : ""}
                </p>
              </div>
              {m.relationship === "child" ? (
                // A student login: their permission is their own pinned scope, not a manager/viewer level.
                <Badge tone="info">Student</Badge>
              ) : (
                <Badge tone={m.accessLevel === "manager" ? "primary" : "neutral"}>
                  {m.accessLevel === "manager" ? "Manager" : "View-only"}
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void remove(m)} aria-label={`Remove ${m.displayName || m.userId}`}>
                <Icon name="close" size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {invites.length > 0 && (
        <div className="border-t border-surface-border">
          <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Pending invites</p>
          <ul className="divide-y divide-surface-border">
            {invites.map((inv) => (
              <PendingInviteRow key={inv.code} invite={inv} onChanged={load} />
            ))}
          </ul>
        </div>
      )}

      {inviting && (
        <MemberInviteModal
          onClose={() => setInviting(false)}
          onCreated={load}
        />
      )}
      {editing && (
        <MemberEditModal
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

/** A pending co-parent/viewer invite with Copy (the join link) and Revoke. */
function PendingInviteRow({ invite, onChanged }: { invite: PendingInvite; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const joinUrl = `${window.location.origin}/join-family?code=${invite.code}`;
  const label = invite.displayName || (invite.relationship ? RELATIONSHIP_LABELS[invite.relationship] : "Invitee");

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Couldn't copy — share the code manually.");
    }
  }
  async function revoke() {
    if (!window.confirm("Revoke this invite? The code will stop working.")) return;
    setBusy(true);
    try {
      await revokeInvite(invite.code);
      toast.success("Invite revoked.");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke.");
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <Icon name="contacts" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-800">{label}</p>
        <p className="truncate font-mono text-xs tracking-widest text-ink-500">{invite.code}</p>
      </div>
      <Badge tone="neutral">{invite.kind === "coparent" ? "Manager" : "View-only"}</Badge>
      <Button variant="ghost" size="sm" onClick={() => void copy()}>
        Copy link
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void revoke()} disabled={busy} aria-label={`Revoke invite ${invite.code}`}>
        Revoke
      </Button>
    </li>
  );
}

/** Invite a co-parent (manager) or viewer via a shareable code — no email. */
function MemberInviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const toast = useToast();
  const [kind, setKind] = useState<Exclude<FamilyInviteKind, "student">>("viewer");
  const [displayName, setDisplayName] = useState("");
  const [relationship, setRelationship] = useState<MemberRelationship>("grandparent");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const created = await createInvite({
        kind,
        relationship,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      setInvite(created);
      await onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={invite ? "Invite created" : "Invite someone"}>
      <div className="space-y-4">
        {invite ? (
          <>
            <p className="text-sm text-ink-600">
              Share this link. They&rsquo;ll choose their own login name and password — no email needed.
            </p>
            <InviteCodePanel invite={invite} />
            <div className="flex justify-end pt-1">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <Field label="Access" hint="Co-parents can edit and invite. Viewers can follow along but not change anything or see private journal entries.">
              <Select value={kind} onChange={(e) => setKind(e.target.value as Exclude<FamilyInviteKind, "student">)}>
                <option value="viewer">View-only</option>
                <option value="coparent">Co-parent (manager)</option>
              </Select>
            </Field>
            <Field label="Relationship">
              <Select value={relationship} onChange={(e) => setRelationship(e.target.value as MemberRelationship)}>
                {ADULT_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {RELATIONSHIP_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name (optional)">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Grandma Jo" />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void generate()} loading={busy} disabled={busy}>
                Create invite link
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Edit an existing member's relationship + access level. */
function MemberEditModal({
  member,
  onClose,
  onSaved,
}: {
  member: FamilyMember;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(member.displayName ?? "");
  const [relationship, setRelationship] = useState<MemberRelationship>(member.relationship);
  const [accessLevel, setAccessLevel] = useState<MemberAccessLevel>(member.accessLevel);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateMember(member.userId, { displayName: displayName.trim() || undefined, relationship, accessLevel });
      toast.success("Updated.");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit access">
      <div className="space-y-4">
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
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
