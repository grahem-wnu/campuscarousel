// First-run onboarding (v2.1 F4; multi-student FTUE 2026-06). Registered as the shell's "onboarding"
// slot, so it mounts on every authenticated load. It decides whether to open the onboarding flow:
//   • LOOP   — a fresh family (empty roster) or a resume (the family declared N kids but fewer are set
//              up). Runs OnboardingFlow, which sets up each child back-to-back and creates the roster.
//   • SINGLE — re-onboarding an EXISTING active student (the dashboard "Set up the profile" button, or
//              switching to a still-un-onboarded sibling). Finishes that student in place.
//   • FORM   — the legacy single-student wizard ("Prefer a form?").
// Dismissals are remembered for the session so a flow doesn't re-pop while the family clicks around.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, useToast } from '../../shared/ui';
import { useActiveStudent } from '../../shared/shell';
import { getProfile, getSetup, putProfile, type StudentProfile } from './api';
import OnboardingFlow from './OnboardingFlow';

type View = null | 'loop' | 'single' | 'form';
const LOOP_KEY = '__loop__'; // dismiss key for the family-level loop (distinct from any studentId)

export default function OnboardingGate() {
  const { activeStudentId, students } = useActiveStudent();
  const [view, setView] = useState<View>(null);
  const [loop, setLoop] = useState({ startIndex: 0, initialTotal: 1 });
  // Keys (LOOP_KEY or a studentId) dismissed this session — don't re-pop them.
  const dismissedRef = useRef<Set<string>>(new Set());
  const activeCount = students.length;

  // Decide what (if anything) to open. Skipped while a flow is already open so we never fight the
  // loop's own state as it creates students / flips the active id.
  useEffect(() => {
    if (view !== null) return;
    let alive = true;
    (async () => {
      const setup = await getSetup().catch(() => ({}) as Awaited<ReturnType<typeof getSetup>>);
      const declared = setup.declaredStudentCount;
      // LOOP: a brand-new family (no kids yet) or a resume (declared more than are set up).
      const needsLoop =
        !dismissedRef.current.has(LOOP_KEY) &&
        (activeCount === 0 || (declared != null && setup.setupComplete !== true && activeCount < declared));
      if (needsLoop) {
        if (!alive) return;
        setLoop({ startIndex: activeCount, initialTotal: declared ?? 1 });
        setView('loop');
        return;
      }
      // SINGLE: the active student exists but isn't onboarded yet.
      if (activeStudentId && !dismissedRef.current.has(activeStudentId)) {
        const p = await getProfile().catch(() => null);
        if (alive && p && p.onboardingComplete !== true) setView('single');
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeStudentId, activeCount, view]);

  // The dashboard's "Set up the profile" button re-opens onboarding for the EXISTING active student.
  useEffect(() => {
    const reopen = () => {
      if (activeStudentId) dismissedRef.current.delete(activeStudentId);
      setView('single');
    };
    window.addEventListener('open-onboarding', reopen);
    return () => window.removeEventListener('open-onboarding', reopen);
  }, [activeStudentId]);

  // Dismiss the right key so the flow doesn't immediately re-pop, then close.
  function close() {
    dismissedRef.current.add(view === 'loop' ? LOOP_KEY : activeStudentId ?? LOOP_KEY);
    setView(null);
  }

  // Loop finished every child: remember it so it won't reopen this session (the flow already
  // navigated + launched the tour).
  function completeLoop() {
    dismissedRef.current.add(LOOP_KEY);
  }

  // Single existing-student onboarding finished.
  function completeSingle() {
    if (activeStudentId) dismissedRef.current.add(activeStudentId);
  }

  if (view === null) return null;
  if (view === 'form') return <Wizard onClose={close} />;
  return (
    <OnboardingFlow
      // Remount when the slot/student identity changes so internal state never leaks across opens.
      key={view === 'loop' ? `loop:${loop.startIndex}` : `single:${activeStudentId ?? 'none'}`}
      startIndex={view === 'loop' ? loop.startIndex : 0}
      initialTotal={view === 'loop' ? loop.initialTotal : 1}
      createStudents={view === 'loop'}
      onAllComplete={view === 'loop' ? completeLoop : completeSingle}
      onClose={close}
      onUseForm={() => setView('form')}
    />
  );
}

function Wizard({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [highSchool, setHighSchool] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [gpa, setGpa] = useState('');
  const [gpaType, setGpaType] = useState<'weighted' | 'unweighted'>('unweighted');
  const [careerGoal, setCareerGoal] = useState('');
  const [majors, setMajors] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');

  const parseMajors = (s: string): string[] =>
    s.split(',').map((m) => m.trim()).filter(Boolean);

  async function saveProfile() {
    setSaving(true);
    try {
      const patch: Partial<StudentProfile> = { gpaType };
      if (name.trim()) patch.name = name.trim();
      if (highSchool.trim()) patch.highSchool = highSchool.trim();
      if (gradYear) patch.graduationYear = Number(gradYear);
      if (gpa) patch.currentGPA = Number(gpa);
      if (careerGoal.trim()) patch.careerGoal = careerGoal.trim();
      const majorList = parseMajors(majors);
      if (majorList.length > 0) patch.intendedMajors = majorList;
      if (location.trim()) patch.location = location.trim();
      if (budget) patch.budget = { total: Number(budget), currency: 'USD' };
      await putProfile(patch);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  /** Mark onboarding complete, close, and optionally jump to a module. */
  async function finish(navigateTo?: string) {
    try {
      await putProfile({ onboardingComplete: true });
    } catch {
      /* non-fatal — closing anyway */
    }
    onClose();
    if (navigateTo) navigate(navigateTo);
  }

  const title =
    step === 1 ? "Welcome — let's set up the student's profile" : step === 2 ? 'Find college programs' : 'Set up goals';

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">A few basics power the dashboard, AI help, and benchmarks. You can change all of this later.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Student name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" />
            </Field>
            <Field label="High school">
              <Input value={highSchool} onChange={(e) => setHighSchool(e.target.value)} />
            </Field>
            <Field label="Graduation year">
              <Input type="number" value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2029" />
            </Field>
            <Field label="Location (city, state)">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Aliso Viejo, CA" />
            </Field>
            <Field label="Current GPA">
              <Input type="number" step="0.01" value={gpa} onChange={(e) => setGpa(e.target.value)} placeholder="4.0" />
            </Field>
            <Field label="GPA type">
              <Select value={gpaType} onChange={(e) => setGpaType(e.target.value as 'weighted' | 'unweighted')}>
                <option value="unweighted">Unweighted</option>
                <option value="weighted">Weighted</option>
              </Select>
            </Field>
            <Field label="Intended major(s)" hint="Comma-separated — list more than one if they're still deciding.">
              <Input value={majors} onChange={(e) => setMajors(e.target.value)} placeholder="e.g. Nursing, Biology" />
            </Field>
            <Field label="Career goal (optional)">
              <Input value={careerGoal} onChange={(e) => setCareerGoal(e.target.value)} placeholder="e.g. Pediatric nurse, Software engineer" />
            </Field>
            <Field label="Family college budget ($)">
              <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="200000" />
            </Field>
          </div>
          <div className="flex justify-between pt-1">
            <Button variant="ghost" onClick={() => void finish()}>
              Skip setup
            </Button>
            <Button loading={saving} onClick={() => void saveProfile()}>
              Save &amp; continue
            </Button>
          </div>
        </div>
      ) : step === 2 ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            Next, let&rsquo;s find programs that fit. The College Finder searches hundreds of schools for
            the student&rsquo;s intended major(s), and pulls tuition, rankings, and contacts — all in real time.
          </p>
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep(3)}>
              Skip for now
            </Button>
            <Button icon="search" onClick={() => void finish('/colleges')}>
              Open College Finder
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            Finally, set up year-by-year goals. The Goal Tracker can suggest milestones based on the
            student&rsquo;s grade level and intended major — accept, edit, or add your own.
          </p>
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <Button variant="ghost" onClick={() => void finish()}>
              Finish
            </Button>
            <Button icon="goal" onClick={() => void finish('/goals')}>
              Open Goal Tracker
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
