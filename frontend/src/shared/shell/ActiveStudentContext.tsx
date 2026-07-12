import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setActiveStudentId as setApiStudentId } from "../api";
import { Spinner } from "../ui/Spinner";
import { useAuth } from "./AuthContext";

/** A child in the family (mirror of the backend Student registry entity). */
export interface Student {
  studentId: string;
  name: string;
  graduationYear?: number;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

interface ActiveStudentState {
  /** The family roster (oldest first). */
  students: Student[];
  /** The currently-selected child, or null when the family has none yet. */
  activeStudentId: string | null;
  activeStudent: Student | null;
  setActiveStudentId: (studentId: string) => void;
  /** Re-fetch the roster (after add/rename/archive on the Family page). */
  reload: () => Promise<void>;
}

const ActiveStudentContext = createContext<ActiveStudentState | null>(null);

const STORAGE_KEY = "keiras:activeStudentId";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode / storage disabled — in-memory selection still works for the session.
  }
}

/** Pick the active id: the stored one if it's still in the roster, else the first active child. */
function resolveActive(students: Student[], stored: string | null): string | null {
  if (stored && students.some((s) => s.studentId === stored)) return stored;
  const firstActive = students.find((s) => s.status === "active") ?? students[0];
  return firstActive?.studentId ?? null;
}

/**
 * Loads the family roster after sign-in and tracks the active student. Blocks rendering of the app
 * (a brief spinner) until the initial roster resolves, so every per-child request carries the right
 * `X-Student-Id` header from the first paint. Switching students remounts the routed page (see
 * AppShell) so each module re-fetches for the newly-selected child without any module-level changes.
 */
export function ActiveStudentProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const apply = useCallback((id: string | null) => {
    setActiveId(id);
    setApiStudentId(id); // stamp the API client immediately (before React re-renders consumers)
    writeStored(id);
  }, []);

  const load = useCallback(async () => {
    const { students: roster } = await api.get<{ students: Student[] }>("/students");
    setStudents(roster);
    apply(resolveActive(roster, readStored()));
  }, [apply]);

  useEffect(() => {
    if (status !== "authenticated") {
      setReady(status === "unauthenticated"); // don't block the login screen
      return;
    }
    let cancelled = false;
    setReady(false);
    void load()
      .catch(() => {
        // A roster fetch failure shouldn't wedge the whole app — render with no active student.
        if (!cancelled) apply(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status, load, apply]);

  const setActiveStudentId = useCallback(
    (studentId: string) => {
      if (studentId !== activeId) apply(studentId);
    },
    [activeId, apply],
  );

  const value = useMemo<ActiveStudentState>(
    () => ({
      students,
      activeStudentId: activeId,
      activeStudent: students.find((s) => s.studentId === activeId) ?? null,
      setActiveStudentId,
      reload: load,
    }),
    [students, activeId, setActiveStudentId, load],
  );

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-primary-500">
        <Spinner size={28} />
      </div>
    );
  }

  return <ActiveStudentContext.Provider value={value}>{children}</ActiveStudentContext.Provider>;
}

/** Access the active-student state. Must be used under an <ActiveStudentProvider>. */
export function useActiveStudent(): ActiveStudentState {
  const ctx = useContext(ActiveStudentContext);
  if (!ctx) throw new Error("useActiveStudent must be used within an ActiveStudentProvider");
  return ctx;
}
