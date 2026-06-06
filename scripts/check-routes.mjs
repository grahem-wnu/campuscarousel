#!/usr/bin/env node
// check:routes — duplicate-route guard.
//
// The HTTP API is assembled from per-module route manifests
// (`backend/modules/<module>/routes.manifest.ts`) so workers never edit a shared
// router file. This guard fails the build if two modules (or one module twice)
// declare the same `method` + `path`, which would otherwise be a silent collision.
//
// It parses each manifest with the TypeScript AST (not regex) so formatting,
// comments, and trailing commas don't matter. It looks for object literals that
// have BOTH a string-literal `method` and a string-literal `path` property — the
// `RouteDef` shape from backend/shared/api/types. Dynamically-computed paths are
// not statically checkable and are reported as skipped (informational, non-fatal).
//
// Node 20 compatible: no fs.globSync / no fs.glob. Manifests live at a fixed depth,
// so a shallow readdir is enough.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// CHECK_ROUTES_MODULES_DIR lets the guard's own test point at a temp fixture tree.
// In CI / normal use it is unset and the real backend/modules path is used.
const modulesDir = process.env.CHECK_ROUTES_MODULES_DIR
  ? resolve(process.env.CHECK_ROUTES_MODULES_DIR)
  : join(repoRoot, 'backend', 'modules');
const MANIFEST = 'routes.manifest.ts';

/** @returns {string[]} absolute paths to every module route manifest */
function findManifests() {
  if (!existsSync(modulesDir)) return [];
  const out = [];
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(modulesDir, entry.name, MANIFEST);
    if (existsSync(candidate)) out.push(candidate);
  }
  return out.sort();
}

/**
 * Read a string-literal property off an object literal, e.g. `method: "GET"`.
 * Returns undefined if absent or not a plain string literal (e.g. a variable).
 * @param {ts.ObjectLiteralExpression} obj
 * @param {string} name
 * @returns {string | undefined}
 */
function stringProp(obj, name) {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
    const key =
      ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)
        ? prop.name.text
        : undefined;
    if (key !== name) continue;
    // Present but non-literal (e.g. a variable/template) → undefined, so the caller
    // routes this manifest to the "dynamic / not statically checkable" bucket.
    return ts.isStringLiteralLike(prop.initializer) ? prop.initializer.text : undefined;
  }
  return undefined;
}

/** Does this object literal have a `method`/`path` property at all (literal or not)? */
function hasProp(obj, name) {
  return obj.properties.some(
    (prop) =>
      ts.isPropertyAssignment(prop) &&
      prop.name &&
      (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) &&
      prop.name.text === name,
  );
}

function collectRoutes(file) {
  const routes = [];
  const dynamic = [];
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const rel = relative(repoRoot, file);

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node) && hasProp(node, 'method') && hasProp(node, 'path')) {
      const method = stringProp(node, 'method');
      const path = stringProp(node, 'path');
      if (method && path) {
        routes.push({ method: method.toUpperCase(), path, file: rel });
      } else {
        dynamic.push(rel);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { routes, dynamic };
}

function main() {
  const manifests = findManifests();
  if (manifests.length === 0) {
    console.log('check:routes ✓ — no route manifests yet (no modules registered).');
    return;
  }

  /** @type {Map<string, string>} key -> first file that declared it */
  const seen = new Map();
  const duplicates = [];
  const dynamicFiles = new Set();
  let total = 0;

  for (const file of manifests) {
    const { routes, dynamic } = collectRoutes(file);
    for (const f of dynamic) dynamicFiles.add(f);
    for (const r of routes) {
      total += 1;
      const key = `${r.method} ${r.path}`;
      const prior = seen.get(key);
      if (prior) {
        duplicates.push({ key, first: prior, second: r.file });
      } else {
        seen.set(key, r.file);
      }
    }
  }

  if (dynamicFiles.size > 0) {
    console.log(
      `check:routes ℹ — ${dynamicFiles.size} manifest(s) contain non-literal method/path ` +
        `(not statically checkable): ${[...dynamicFiles].join(', ')}`,
    );
  }

  if (duplicates.length > 0) {
    console.error(`check:routes ✗ — ${duplicates.length} duplicate route(s) across module manifests:`);
    for (const d of duplicates) {
      console.error(`  • ${d.key}\n      first:  ${d.first}\n      second: ${d.second}`);
    }
    console.error('\nEach method+path must be owned by exactly one module. Resolve the collision and retry.');
    process.exit(1);
  }

  console.log(
    `check:routes ✓ — ${total} route(s) across ${manifests.length} manifest(s), no duplicates.`,
  );
}

main();
