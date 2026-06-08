// Manifest globbing. Each module ships `backend/modules/<m>/routes.manifest.ts` exporting
// `routes: RouteDef[]`. There is no shared registry file to merge-conflict on — the router
// discovers manifests by scanning the modules directory and importing each one.
//
// `collectRoutes` is the pure aggregation step (flatten + duplicate detection) and is what the
// unit tests exercise. `loadManifests` is the filesystem side (one dynamic import per module),
// used by the Lambda entry: `createLambdaHandler(await loadRoutes(MODULES_DIR))`.

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RouteDef, RouteManifest } from './types.js';

/** Manifest file basenames to look for, in resolution order (compiled .js wins in prod). */
const MANIFEST_BASENAMES = ['routes.manifest.js', 'routes.manifest.mjs', 'routes.manifest.ts'];

/**
 * Flatten module manifests into one route list, failing loudly on a duplicate method+path
 * across modules (the same invariant `check:routes` enforces statically at build time).
 */
export function collectRoutes(manifests: RouteManifest[]): RouteDef[] {
  const routes: RouteDef[] = [];
  const seen = new Set<string>();
  for (const manifest of manifests) {
    for (const route of manifest.routes ?? []) {
      const key = `${route.method.toUpperCase()} ${route.path}`;
      if (seen.has(key)) {
        throw new Error(`Duplicate route across manifests: ${key}`);
      }
      seen.add(key);
      routes.push(route);
    }
  }
  return routes;
}

/**
 * Discover and import every module's route manifest under `baseDir` (each immediate
 * subdirectory may contain one). Missing directory → empty list. A subdirectory without a
 * manifest is skipped.
 */
export async function loadManifests(baseDir: string): Promise<RouteManifest[]> {
  let dirents;
  try {
    dirents = await readdir(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const manifests: RouteManifest[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const found = await importFirst(join(baseDir, dirent.name));
    if (found) manifests.push(found);
  }
  return manifests;
}

async function importFirst(moduleDir: string): Promise<RouteManifest | undefined> {
  for (const basename of MANIFEST_BASENAMES) {
    const candidate = join(moduleDir, basename);
    if (!existsSync(candidate)) continue;
    // A real error inside an existing manifest is intentionally allowed to surface.
    const mod = (await import(pathToFileURL(candidate).href)) as RouteManifest;
    return mod;
  }
  return undefined;
}

/** Convenience: load + flatten all module routes under `baseDir`. */
export async function loadRoutes(baseDir: string): Promise<RouteDef[]> {
  return collectRoutes(await loadManifests(baseDir));
}
