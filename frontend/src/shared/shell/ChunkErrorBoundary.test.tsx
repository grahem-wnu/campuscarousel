// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChunkErrorBoundary, installChunkReloadListener, isChunkLoadError, tryArmReload } from './ChunkErrorBoundary';

const CHUNK_ERROR = new TypeError(
  'Failed to fetch dynamically imported module: https://staging.campuscarousel.com/assets/GuidedTour-C9Zt0DIW.js',
);

function Boom({ error }: { error: Error }): never {
  throw error;
}

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('isChunkLoadError', () => {
  it('matches the browser messages for failed dynamic imports', () => {
    expect(isChunkLoadError(CHUNK_ERROR)).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('does not match ordinary render errors', () => {
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('tryArmReload', () => {
  it('allows the first attempt and blocks a second inside the guard window', () => {
    expect(tryArmReload(1_000_000)).toBe(true);
    expect(tryArmReload(1_010_000)).toBe(false);
    expect(tryArmReload(1_000_000 + 61_000)).toBe(true);
  });
});

describe('ChunkErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ChunkErrorBoundary>
        <p>content</p>
      </ChunkErrorBoundary>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('auto-reloads once on a stale-chunk error', () => {
    const reload = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs caught errors
    render(
      <ChunkErrorBoundary reload={reload}>
        <Boom error={CHUNK_ERROR} />
      </ChunkErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the fallback (no second reload) when a chunk error repeats inside the guard window', () => {
    const reload = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tryArmReload(); // simulate: a reload was already attempted moments ago
    render(
      <ChunkErrorBoundary reload={reload}>
        <Boom error={CHUNK_ERROR} />
      </ChunkErrorBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('Something needs a refresh')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Reload' }).click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the fallback without reloading for non-chunk errors', () => {
    const reload = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ChunkErrorBoundary reload={reload}>
        <Boom error={new Error('boom')} />
      </ChunkErrorBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('Something needs a refresh')).toBeInTheDocument();
  });
});

describe('installChunkReloadListener', () => {
  it('reloads on vite:preloadError and prevents the default', () => {
    const reload = vi.fn();
    const cleanup = installChunkReloadListener(reload);
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    // Guard is armed now — a second failure does not reload again.
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
