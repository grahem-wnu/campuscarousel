// Post-onboarding guided tour. Registered as the shell "tour" slot, so it mounts app-wide and waits
// for the `start-tour` event (dispatched by OnboardingFlow once a new family finishes setup). It walks
// a few key surfaces — the student switcher FIRST (only when the family has 2+ kids), then Focus,
// Journal, Colleges, Reminders. Steps whose anchor isn't in the DOM are skipped gracefully. Completion
// is remembered in localStorage so it runs once. Desktop gets a spotlight cutout; mobile gets a simple
// centered card (no rect math). No external deps.

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useActiveStudent } from '../../shared/shell';

const DONE_KEY = 'campus-carousel:tourComplete';
const DESKTOP_MIN = 1024; // tailwind `lg`

interface Step {
  key: string;
  selector: string;
  title: string;
  body: string;
  /** Only relevant once the family has 2+ active children (the switcher is hidden otherwise). */
  needsMultiStudent?: boolean;
}

const STEPS: Step[] = [
  {
    key: 'switcher',
    selector: '[data-tour="switcher"]',
    title: 'Switch between your kids',
    body: 'Each child has their own plan. Tap here anytime to switch who you’re viewing.',
    needsMultiStudent: true,
  },
  { key: 'focus', selector: '[data-tour="/focus"]', title: 'Their focus', body: 'Every route to the careers they’re weighing — majors, schools, and the steps to get there.' },
  { key: 'journal', selector: '[data-tour="/journal"]', title: 'Journal', body: 'Capture reflections, clinical hours, and milestones as you go.' },
  { key: 'colleges', selector: '[data-tour="/colleges"]', title: 'Colleges', body: 'We seeded a starter list — explore programs, deadlines, and costs here.' },
  { key: 'reminders', selector: '[data-tour="/reminders"]', title: 'Reminders', body: 'Weekly digests keep the whole family on top of deadlines.' },
];

function isComplete(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}
function markComplete(): void {
  try {
    window.localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* private mode — the tour just may show again next session */
  }
}

export default function GuidedTour() {
  const { students } = useActiveStudent();
  const activeCount = students.filter((s) => s.status === 'active').length;
  const [steps, setSteps] = useState<Step[]>([]);
  const [i, setI] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const start = useCallback(() => {
    if (isComplete()) return;
    const usable = STEPS.filter(
      (s) => (!s.needsMultiStudent || activeCount >= 2) && document.querySelector(s.selector) != null,
    );
    if (usable.length === 0) return;
    setSteps(usable);
    setI(0);
  }, [activeCount]);

  useEffect(() => {
    window.addEventListener('start-tour', start);
    return () => window.removeEventListener('start-tour', start);
  }, [start]);

  const finish = useCallback(() => {
    markComplete();
    setI(-1);
    setSteps([]);
    setRect(null);
  }, []);

  const active = i >= 0 && i < steps.length;
  const step = active ? steps[i] : undefined;

  // Track the current target's position (desktop spotlight). Recompute on step change + resize/scroll.
  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = document.querySelector(step.selector);
      if (!el) {
        // Anchor vanished (e.g. layout change) — advance past it.
        setI((n) => (n + 1 < steps.length ? n + 1 : -1));
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, steps.length]);

  if (!active || !step) return null;

  const isLast = i === steps.length - 1;
  const next = () => (isLast ? finish() : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;
  const pad = 6;

  const card = (
    <div
      role="dialog"
      aria-label={`Tour: ${step.title}`}
      className="pointer-events-auto w-[20rem] max-w-[90vw] rounded-xl border border-surface-border bg-surface-raised p-4 shadow-lg"
    >
      <p className="text-sm font-semibold text-ink-800">{step.title}</p>
      <p className="mt-1 text-sm text-ink-600">{step.body}</p>
      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={finish} className="text-xs text-ink-400 hover:text-ink-600 hover:underline">
          Skip
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-400">
            {i + 1} / {steps.length}
          </span>
          {i > 0 && (
            <button type="button" onClick={back} className="rounded-lg px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-100">
              Back
            </button>
          )}
          <button type="button" onClick={next} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700">
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );

  // Mobile (or no rect yet): a simple centered card, no spotlight cutout.
  if (!isDesktop || !rect) {
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center bg-ink-900/40 p-4">{card}</div>
    );
  }

  // Desktop: spotlight cutout via a big box-shadow around the target, with the card beneath/above it.
  const below = rect.top + rect.height + 12;
  const cardTop = below + 220 > window.innerHeight ? Math.max(12, rect.top - 200) : below;
  return (
    <div className="fixed inset-0 z-modal" aria-hidden={false}>
      <div
        className="pointer-events-none absolute rounded-lg"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: '0 0 0 9999px rgba(17, 24, 39, 0.55)',
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{ top: cardTop, left: Math.min(Math.max(12, rect.left), window.innerWidth - 332) }}
      >
        {card}
      </div>
    </div>
  );
}
