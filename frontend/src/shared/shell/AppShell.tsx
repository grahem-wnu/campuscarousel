import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../ui/cn";
import { Icon, isIconName } from "../ui/Icon";
import { useAuth } from "./AuthContext";
import { useActiveStudent } from "./ActiveStudentContext";
import { SlideOver } from "./SlideOver";
import { Modal } from "../ui/Modal";
import { SlotOutlet } from "./SlotOutlet";
import type { AssembledNav, NavEntry } from "./types";

/** Number of primary entries shown in the mobile bottom bar. */
const MOBILE_PRIMARY_MAX = 5;

function navIcon(entry: NavEntry, size: number) {
  const name = isIconName(entry.icon) ? entry.icon : "home";
  return <Icon name={name} size={size} />;
}

/**
 * The authenticated app chrome: top nav (logo + primary tabs + overflow + user menu),
 * a mobile bottom tab bar with a hamburger overflow, an app-wide Quick-Add FAB, and a
 * floating AI chat button that opens a slide-over. Routed pages render in <Outlet>.
 */
export function AppShell({ nav }: { nav: AssembledNav }) {
  const { user, signOut } = useAuth();
  const { activeStudentId } = useActiveStudent();
  const [menuOpen, setMenuOpen] = useState(false); // mobile hamburger (secondary)
  const [moreOpen, setMoreOpen] = useState(false); // desktop "More" dropdown
  const [userOpen, setUserOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const mobilePrimary = nav.primary.slice(0, MOBILE_PRIMARY_MAX);

  return (
    <div className="flex min-h-full flex-col bg-surface-base">
      {/* Top navigation */}
      <header className="sticky top-0 z-nav border-b border-surface-border bg-surface-raised/95 backdrop-blur">
        <div className="mx-auto flex h-nav-h max-w-6xl items-center gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-primary-700">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Icon name="school" size={18} />
            </span>
            <span className="hidden sm:inline">Keira&rsquo;s Journey</span>
          </NavLink>

          {/* Desktop primary tabs */}
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {nav.primary.map((e) => (
              <TopTab key={e.id} entry={e} />
            ))}
            {nav.secondary.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100"
                >
                  More <Icon name="chevron-down" size={14} />
                </button>
                {moreOpen && (
                  <Dropdown onClose={() => setMoreOpen(false)}>
                    {nav.secondary.map((e) => (
                      <DropdownLink key={e.id} entry={e} onNavigate={() => setMoreOpen(false)} />
                    ))}
                  </Dropdown>
                )}
              </div>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {/* Active-student switcher (multi-student) */}
            <StudentSwitcher />

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-100"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-100 text-secondary-700">
                  <Icon name="user" size={18} />
                </span>
                <span className="hidden text-sm font-medium text-ink-700 sm:inline">
                  {user?.username}
                </span>
              </button>
              {userOpen && (
                <Dropdown align="right" onClose={() => setUserOpen(false)}>
                  <div className="border-b border-surface-border px-3 py-2">
                    <p className="text-sm font-medium text-ink-800">{user?.username}</p>
                    <p className="text-xs capitalize text-ink-500">{user?.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserOpen(false);
                      void signOut();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-100"
                  >
                    <Icon name="logout" size={16} /> Sign out
                  </button>
                </Dropdown>
              )}
            </div>

            {/* Mobile hamburger */}
            {nav.secondary.length > 0 && (
              <button
                type="button"
                aria-label="Menu"
                className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 md:hidden"
                onClick={() => setMenuOpen(true)}
              >
                <Icon name="menu" size={22} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Routed content. Keyed by the active student so switching kids remounts the page and each
          module re-fetches for the newly-selected child — no per-module change needed. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:pb-8">
        <div key={activeStudentId ?? "no-student"}>
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      {mobilePrimary.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-bottombar flex h-bottombar-h items-stretch border-t border-surface-border bg-surface-raised pb-safe md:hidden">
          {mobilePrimary.map((e) => (
            <BottomTab key={e.id} entry={e} />
          ))}
        </nav>
      )}

      {/* Floating actions: Quick-add FAB + AI chat */}
      <div className="bottom-safe fixed right-4 z-fab flex flex-col items-end gap-3 md:bottom-6">
        <button
          type="button"
          aria-label="Open AI assistant"
          onClick={() => setAiOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-primary-700 shadow-md ring-1 ring-surface-border hover:bg-primary-50"
        >
          <Icon name="chat" size={22} />
        </button>
        <button
          type="button"
          aria-label="Quick add"
          onClick={() => setQuickAddOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-fab hover:bg-primary-700"
        >
          <Icon name="plus" size={26} />
        </button>
      </div>

      {/* Mobile secondary nav drawer */}
      <SlideOver open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <div className="flex flex-col p-2">
          {[...nav.primary, ...nav.secondary].map((e) => (
            <DrawerLink key={e.id} entry={e} onNavigate={() => setMenuOpen(false)} />
          ))}
        </div>
      </SlideOver>

      {/* AI assistant slide-over (filled by the ai-panel slot when present) */}
      <SlideOver open={aiOpen} onClose={() => setAiOpen(false)} title="AI Assistant">
        <SlotOutlet
          name="ai-panel"
          placeholder={
            <PlaceholderBody
              icon="chat"
              text="The AI assistant will live here — ready to help with essays, interviews, and your timeline."
            />
          }
        />
      </SlideOver>

      {/* Quick-add (filled by the quick-add slot when present) */}
      <Modal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} title="Quick add">
        <SlotOutlet
          name="quick-add"
          placeholder={
            <PlaceholderBody
              icon="plus"
              text="Quick-add a journal entry or activity from anywhere. (Coming with the Journal module.)"
            />
          }
        />
      </Modal>

      {/* First-run onboarding (filled by the onboarding slot; renders itself only when incomplete) */}
      <SlotOutlet name="onboarding" placeholder={null} />
    </div>
  );
}

function TopTab({ entry }: { entry: NavEntry }) {
  return (
    <NavLink
      to={entry.route}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-primary-50 text-primary-700" : "text-ink-600 hover:bg-ink-100",
        )
      }
    >
      {navIcon(entry, 18)}
      {entry.label}
    </NavLink>
  );
}

function BottomTab({ entry }: { entry: NavEntry }) {
  return (
    <NavLink
      to={entry.route}
      className={({ isActive }) =>
        cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs",
          isActive ? "text-primary-700" : "text-ink-500",
        )
      }
    >
      {navIcon(entry, 22)}
      <span className="truncate">{entry.label}</span>
    </NavLink>
  );
}

function DrawerLink({ entry, onNavigate }: { entry: NavEntry; onNavigate: () => void }) {
  return (
    <NavLink
      to={entry.route}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
          isActive ? "bg-primary-50 text-primary-700" : "text-ink-700 hover:bg-ink-100",
        )
      }
    >
      {navIcon(entry, 20)}
      {entry.label}
    </NavLink>
  );
}

function DropdownLink({ entry, onNavigate }: { entry: NavEntry; onNavigate: () => void }) {
  return (
    <NavLink
      to={entry.route}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 px-3 py-2 text-sm",
          isActive ? "bg-primary-50 text-primary-700" : "text-ink-700 hover:bg-ink-100",
        )
      }
    >
      {navIcon(entry, 16)}
      {entry.label}
    </NavLink>
  );
}

/** Small click-away dropdown panel. */
function Dropdown({
  children,
  align = "left",
  onClose,
}: {
  children: ReactNode;
  align?: "left" | "right";
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          "absolute z-overlay mt-1 min-w-44 overflow-hidden rounded-lg border border-surface-border bg-surface-raised py-1 shadow-md",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </div>
    </>
  );
}

/**
 * Active-student picker shown in the top bar. Hidden when the family has only one child (nothing to
 * switch); a single-child family just sees that name implicitly. Switching updates the API header and
 * remounts the routed page (see the keyed <main>) so the new child's data loads.
 */
function StudentSwitcher() {
  const { students, activeStudent, setActiveStudentId } = useActiveStudent();
  const [open, setOpen] = useState(false);
  const selectable = students.filter((s) => s.status === "active");

  // Nothing to switch between → keep the bar clean. The Family page is where you add the first child.
  if (selectable.length < 2) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
        aria-label="Switch student"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Icon name="user" size={15} />
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{activeStudent?.name ?? "Choose child"}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <Dropdown onClose={() => setOpen(false)}>
          <div className="border-b border-surface-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Viewing
          </div>
          {selectable.map((s) => (
            <button
              key={s.studentId}
              type="button"
              onClick={() => {
                setActiveStudentId(s.studentId);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-ink-100",
                s.studentId === activeStudent?.studentId ? "text-primary-700" : "text-ink-700",
              )}
            >
              <span className="truncate">{s.name}</span>
              {s.studentId === activeStudent?.studentId && <Icon name="check" size={15} />}
            </button>
          ))}
        </Dropdown>
      )}
    </div>
  );
}

function PlaceholderBody({ icon, text }: { icon: "chat" | "plus"; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-ink-500">
      <Icon name={icon} size={28} />
      <p className="max-w-xs text-sm">{text}</p>
    </div>
  );
}
