import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, useToast } from "../../shared/ui";
import { useActiveStudent, type Student } from "../../shared/shell";
import { createStudent, deleteStudent, updateStudent } from "./api";

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
              description="Add your first child to start tracking their path to nursing."
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

      <Card>
        <div className="border-b border-surface-border px-4 py-3">
          <h2 className="font-semibold text-ink-800">Parents &amp; access</h2>
        </div>
        <div className="p-4 text-sm text-ink-500">
          Inviting a co-parent to share access is coming soon. For now, account access is managed by your
          administrator.
        </div>
      </Card>

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
