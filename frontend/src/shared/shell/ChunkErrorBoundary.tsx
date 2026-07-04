import { Component, type ErrorInfo, type ReactNode } from "react";

// After every deploy, a browser holding the previous index.html requests lazy chunks whose hashed
// filenames no longer exist on the CDN; the failed dynamic import throws through Suspense and, with
// no boundary, white-screens the whole app (seen live on staging). A reload fetches the fresh
// index.html and fixes it — so do that automatically, once.

/** How long a reload attempt "counts" — a second chunk failure inside this window means reloading
 *  didn't help (offline? CDN outage?), so show the fallback instead of reload-looping. */
const RELOAD_GUARD_MS = 60_000;
const GUARD_KEY = "cc-chunk-reload";

/** A failed lazy-route import, in the shapes Vite/Chromium/Firefox/Safari actually produce. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /css chunk load failed/i.test(message) ||
    /loading chunk .* failed/i.test(message)
  );
}

/** True if we may auto-reload (no recent attempt); records the attempt when allowed. Storage
 *  failures (private mode) just mean we never auto-reload — the fallback UI still shows. */
export function tryArmReload(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY) ?? 0);
    if (now - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(GUARD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** Install the window-level guard for Vite's own module-preload failures (fires before React sees
 *  anything). Returns the cleanup, for symmetry/tests. */
export function installChunkReloadListener(reload: () => void = () => window.location.reload()): () => void {
  const onPreloadError = (event: Event) => {
    if (!tryArmReload()) return; // let it surface; the boundary shows the fallback
    event.preventDefault();
    reload();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}

interface Props {
  children: ReactNode;
  /** Injectable for tests. */
  reload?: () => void;
}

interface State {
  failed: boolean;
}

/**
 * Catches render-time errors from lazy routes. A stale-chunk error triggers one automatic reload
 * (guarded, so a dead CDN can't loop us); anything else — or a chunk error right after a reload
 * already tried — renders a friendly full-page fallback instead of a white screen.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    if (isChunkLoadError(error) && tryArmReload()) {
      (this.props.reload ?? (() => window.location.reload()))();
    }
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-full items-center justify-center bg-surface-base px-4 py-12">
        <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6 text-center shadow-md">
          <h1 className="font-display text-xl font-bold text-ink-900">Something needs a refresh</h1>
          <p className="mt-2 text-sm text-ink-600">
            The app was updated while this page was open. Reloading picks up the new version.
          </p>
          <button
            type="button"
            onClick={() => (this.props.reload ?? (() => window.location.reload()))()}
            className="mt-4 inline-flex items-center justify-center whitespace-nowrap rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
