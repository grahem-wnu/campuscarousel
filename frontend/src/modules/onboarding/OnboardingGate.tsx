// First-run onboarding (v2.1 F4). Registered as the shell's "onboarding" slot, so it mounts on every
// authenticated load. It fetches the ACTIVE student's profile and, when onboarding isn't complete,
// shows a 3-step wizard (profile → discover colleges → set up goals). Steps 2 & 3 hand off to the
// existing College Finder / Goal Tracker rather than reimplementing them. Any hand-off or "Finish"
// marks onboardingComplete so it never nags again. Re-evaluates on student switch so a newly added
// sibling gets onboarded too, and re-opens on the dashboard's "Set up the profile" button.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, useToast } from '../../shared/ui';
import { useActiveStudent } from '../../shared/shell';
import { getProfile, putProfile, type StudentProfile } from './api';

export default function OnboardingGate() {
  const { activeStudentId } = useActiveStudent();
  const [open, setOpen] = useState(false);
  // Students whose wizard was dismissed this session — don't re-pop when toggling back to them.
  const dismissedRef = useRef<Set<string>>(new Set());

  // Re-evaluate per ACTIVE student: switching to a fresh, un-onboarded student (e.g. a newly added
  // sibling) must surface the setup wizard. The previous mount-once check missed that, so a
  // switched-to profile just landed on a dead-end empty dashboard.
  useEffect(() => {
    if (!activeStudentId || dismissedRef.current.has(activeStudentId)) return;
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setOpen(p.onboardingComplete !== true);
      })
      .catch(() => {
        /* if profile can't load, don't block the app */
      });
    return () => {
      alive = false;
    };
  }, [activeStudentId]);

  // The dashboard's "Set up the profile" button re-opens the wizard for the active student.
  useEffect(() => {
    const reopen = () => {
      if (activeStudentId) dismissedRef.current.delete(activeStudentId);
      setOpen(true);
    };
    window.addEventListener('open-onboarding', reopen);
    return () => window.removeEventListener('open-onboarding', reopen);
  }, [activeStudentId]);

  function handleClose() {
    // Remember the dismissal for this session so it doesn't re-pop on every switch back (a finish/skip
    // also persists onboardingComplete, so it won't return in future sessions either).
    if (activeStudentId) dismissedRef.current.add(activeStudentId);
    setOpen(false);
  }

  if (!open) return null;
  return <Wizard onClose={handleClose} />;
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
