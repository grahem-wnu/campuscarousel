import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, 'check-routes.mjs');

/**
 * Run the real guard against a throwaway modules tree (via CHECK_ROUTES_MODULES_DIR),
 * so `typescript` still resolves from the real node_modules. Returns {code, out}.
 */
function runGuard(modules: Record<string, string>): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'check-routes-'));
  try {
    for (const [mod, contents] of Object.entries(modules)) {
      const moduleDir = join(dir, mod);
      mkdirSync(moduleDir, { recursive: true });
      writeFileSync(join(moduleDir, 'routes.manifest.ts'), contents);
    }
    try {
      const out = execFileSync('node', [scriptPath], {
        encoding: 'utf8',
        env: { ...process.env, CHECK_ROUTES_MODULES_DIR: dir },
      });
      return { code: 0, out };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const manifest = (routes: Array<[string, string]>) => `
import type { RouteDef } from "../../shared/api/types";
export const routes: RouteDef[] = [
${routes.map(([m, p]) => `  { method: "${m}", path: "${p}", handler: h },`).join('\n')}
];
`;

describe('check:routes guard', () => {
  it('passes when every method+path is unique across modules', () => {
    const { code, out } = runGuard({
      journal: manifest([
        ['GET', '/activities'],
        ['POST', '/activities'],
      ]),
      colleges: manifest([['GET', '/colleges']]),
    });
    expect(code).toBe(0);
    expect(out).toContain('no duplicates');
  });

  it('allows the same path with different methods', () => {
    const { code } = runGuard({
      journal: manifest([
        ['GET', '/activities'],
        ['DELETE', '/activities'],
      ]),
    });
    expect(code).toBe(0);
  });

  it('fails when two modules declare the same method+path', () => {
    const { code, out } = runGuard({
      journal: manifest([['GET', '/activities']]),
      shadow: manifest([['GET', '/activities']]),
    });
    expect(code).toBe(1);
    expect(out).toContain('duplicate route');
    expect(out).toContain('GET /activities');
  });

  it('fails on a duplicate within a single manifest (method case-insensitive)', () => {
    const { code, out } = runGuard({
      journal: manifest([
        ['get', '/activities'],
        ['GET', '/activities'],
      ]),
    });
    expect(code).toBe(1);
    expect(out).toContain('GET /activities');
  });

  it('passes cleanly when there are no module manifests at all', () => {
    const { code, out } = runGuard({});
    expect(code).toBe(0);
    expect(out).toContain('no route manifests');
  });
});
