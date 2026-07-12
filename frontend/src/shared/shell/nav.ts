import type { AssembledNav, NavEntry, Role } from "./types";

/**
 * Pure nav assembly. Kept separate from the glob loader so it can be unit-tested with
 * fixtures. Filters by role, drops hidden entries from the menus (but keeps them as
 * routes), and sorts each group by `order` then `label`.
 *
 * Duplicate `id`s or duplicate `route`s across modules are a build-time mistake (the
 * backend has `check:routes`; here we throw loudly so it surfaces in dev/CI).
 */
export function assembleNav(entries: NavEntry[], role?: Role, platformAdmin?: boolean): AssembledNav {
  const byId = new Set<string>();
  const byRoute = new Set<string>();
  for (const e of entries) {
    if (byId.has(e.id)) throw new Error(`Duplicate nav id: "${e.id}"`);
    if (byRoute.has(e.route)) throw new Error(`Duplicate nav route: "${e.route}"`);
    byId.add(e.id);
    byRoute.add(e.route);
  }

  const visible = entries.filter((e) => canSee(e, role, platformAdmin));
  const sort = (a: NavEntry, b: NavEntry) =>
    a.order - b.order || a.label.localeCompare(b.label);

  const menu = visible.filter((e) => !e.hidden);
  return {
    primary: menu.filter((e) => e.group === "primary").sort(sort),
    secondary: menu.filter((e) => e.group === "secondary").sort(sort),
    routes: [...visible].sort(sort),
  };
}

/** Visibility gate for a single entry. Platform-admin entries require the platformAdmin flag; otherwise
 *  no `roles` = visible to everyone, else the caller's role must be in `roles`. */
export function canSee(entry: NavEntry, role?: Role, platformAdmin?: boolean): boolean {
  if (entry.platformAdmin && !platformAdmin) return false;
  if (!entry.roles || entry.roles.length === 0) return true;
  if (!role) return false;
  return entry.roles.includes(role);
}

/**
 * Load every module's nav manifest via Vite's glob. Importing the manifests eagerly
 * also runs any app-wide slot registrations they perform as a side effect.
 * Returns the flat list of entries (unsorted, unfiltered) — pass to {@link assembleNav}.
 */
export function loadNavEntries(): NavEntry[] {
  const modules = import.meta.glob<{ nav?: NavEntry[] }>("/src/modules/*/nav.manifest.ts", {
    eager: true,
  });
  const entries: NavEntry[] = [];
  for (const mod of Object.values(modules)) {
    if (mod.nav) entries.push(...mod.nav);
  }
  return entries;
}
