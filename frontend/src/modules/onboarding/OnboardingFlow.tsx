// The multi-child onboarding LOOP (Approach A: the frontend orchestrates; the chat stays single-child).
// It runs OnboardingChat once per child and, on each child's finish, performs the structural side
// effects the chat must not own: create the roster entry, make it the active student (so seeding is
// correctly scoped via X-Student-Id), persist the family's declared count for resume, then advance —
// landing on the dashboard and launching the guided tour only after the last child.

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, useToast } from '../../shared/ui';
import { useActiveStudent, type Student } from '../../shared/shell';
import { api } from '../../shared/api';
import OnboardingChat from './OnboardingChat';
import { finishOnboarding, putSetup, type OnboardingProfile } from './api';

export default function OnboardingFlow({
  startIndex = 0,
  initialTotal = 1,
  createStudents = true,
  onClose,
  onAllComplete,
  onUseForm,
}: {
  /** 0-based child to start on (resume passes the number already set up). */
  startIndex?: number;
  /** Best-known child count at mount (resume passes the persisted declaredStudentCount). */
  initialTotal?: number;
  /** New-family loop creates a roster entry per child. When false (re-onboarding an EXISTING active
   *  student — e.g. the dashboard "set up profile" button), finish in place and don't touch the
   *  family setup state or launch the tour. */
  createStudents?: boolean;
  onClose: () => void;
  /** Fired once every child is set up (the gate uses it to remember completion). */
  onAllComplete: () => void;
  /** Switch to the legacy single-child form (gate-managed fallback). */
  onUseForm: () => void;
}) {
  const { setActiveStudentId, reload } = useActiveStudent();
  const navigate = useNavigate();
  const toast = useToast();
  const [index, setIndex] = useState(startIndex);
  const [total, setTotal] = useState(Math.max(initialTotal, startIndex + 1));
  // totalRef mirrors `total` so handleFinish reads the latest count without stale-closure risk.
  const totalRef = useRef(total);

  function handleStudentCount(n: number) {
    if (n >= 1 && n !== totalRef.current) {
      totalRef.current = Math.max(n, index + 1);
      setTotal(totalRef.current);
      // Persist for resume; non-fatal if it fails (the family can still finish in this session).
      void putSetup({ declaredStudentCount: n }).catch(() => {});
    }
  }

  // Per-child finish: (new-family) create the roster entry → activate (stamps X-Student-Id) → seed →
  // advance; (in-place) just seed the already-active student.
  async function handleFinish(profile: OnboardingProfile) {
    if (createStudents) {
      const student = await api.post<Student>('/students', {
        name: profile.name ?? `Student ${index + 1}`,
        ...(profile.graduationYear != null ? { graduationYear: profile.graduationYear } : {}),
      });
      setActiveStudentId(student.studentId); // synchronous: scopes the next request to this child
    }
    await finishOnboarding(profile); // seeds goals/colleges/budget for the active child (async hydration)
    await reload(); // refresh the roster so the switcher + resume math see the new child

    const next = index + 1;
    if (next >= totalRef.current) {
      if (createStudents) await putSetup({ setupComplete: true }).catch(() => {});
      onAllComplete();
      onClose();
      window.dispatchEvent(new Event('onboarding-finished')); // tell a mounted dashboard to refetch
      if (createStudents) window.dispatchEvent(new Event('start-tour')); // kick off the guided tour
      navigate('/dashboard');
    } else {
      setIndex(next); // key change remounts the chat fresh for the next child
    }
  }

  // Surface a failure but DON'T advance — the family can retry the finish. (handleFinish throws up
  // into OnboardingChat's own error UI; this toast adds a top-level signal.)
  function onFinish(profile: OnboardingProfile): Promise<void> {
    return handleFinish(profile).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Could not finish setup — try again.');
      throw e;
    });
  }

  const hasMore = index + 1 < total;
  const title = total > 1 ? `Set things up — student ${index + 1} of ${total}` : "Let's set things up";

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      <OnboardingChat
        key={index}
        childIndex={index}
        finishLabel={hasMore ? 'Save & set up the next child' : 'Finish & open the dashboard'}
        onStudentCount={handleStudentCount}
        onFinish={onFinish}
        onUseForm={onUseForm}
      />
    </Modal>
  );
}
