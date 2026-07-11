import { useState } from 'react';
import { CollegeEssayList } from './CollegeEssayList';
import { CollegeEssayView } from './CollegeEssayView';

/** Essay Center — the app's end goal. No tabs: a college list is the home, and picking a school
 *  opens that school's essay view (its practice attempts + a coached, questions-first writing flow).
 *  Every AI coach action is grounded in the fixed college and Keira's real, privacy-filtered data. */
export default function EssayCenterPage() {
  const [college, setCollege] = useState<{ collegeId: string; name: string } | undefined>(undefined);
  const [mode, setMode] = useState<'new' | 'attempts'>('attempts');

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Essay Center</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Write standout essays, one school at a time, with an AI coach grounded in your real
          experiences. I coach you and rate it — I never write it for you.
        </p>
      </header>

      {college ? (
        <CollegeEssayView college={college} startMode={mode} onBack={() => setCollege(undefined)} />
      ) : (
        <CollegeEssayList
          onStart={(c) => {
            setCollege(c);
            setMode('new');
          }}
          onOpen={(c) => {
            setCollege(c);
            setMode('attempts');
          }}
        />
      )}
    </div>
  );
}
