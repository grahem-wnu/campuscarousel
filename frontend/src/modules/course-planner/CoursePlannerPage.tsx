import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Modal,
  Spinner,
  Tabs,
  useToast,
  type TabItem,
} from '../../shared/ui';
import { deleteCourse, listCourses } from './api';
import { CourseForm } from './CourseForm';
import { CourseGrid } from './CourseGrid';
import { GpaCalculator } from './GpaCalculator';
import { PrereqChecker } from './PrereqChecker';
import type { Course } from './types';

type TabId = 'grid' | 'gpa' | 'prerequisites';

/** Course Planner — 4-year grid, GPA calculator (with what-if), and prerequisite checker. */
export default function CoursePlannerPage() {
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCourses(await listCourses());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your courses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew(): void {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(course: Course): void {
    setEditing(course);
    setShowForm(true);
  }

  async function handleDelete(course: Course): Promise<void> {
    if (!window.confirm(`Remove "${course.name}" from your plan?`)) return;
    try {
      await deleteCourse(course.courseId);
      toast.success('Course removed.');
      setShowForm(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the course.');
    }
  }

  const tabs: TabItem[] = [
    { id: 'grid', label: '4-Year Plan', count: courses.length },
    { id: 'gpa', label: 'GPA' },
    { id: 'prerequisites', label: 'Prerequisites' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Course Planner</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Map your four years, track your GPA, and see how your courses cover college prerequisites.
          </p>
        </div>
        <Button icon="plus" onClick={openNew}>
          Add course
        </Button>
      </header>

      <Tabs items={tabs} value={tab} onChange={(id) => setTab(id as TabId)} />

      {error ? (
        <Card className="border border-error-200 bg-error-50 text-error-700">
          <p className="text-sm">{error}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === 'gpa' ? (
        <GpaCalculator courses={courses} />
      ) : tab === 'prerequisites' ? (
        <PrereqChecker courses={courses} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon="course"
          title="Start your course plan"
          description="Add your classes — past, current, and planned. Track grades for GPA, and tag which college prerequisites each course satisfies."
          action={
            <Button icon="plus" onClick={openNew}>
              Add your first course
            </Button>
          }
        />
      ) : (
        <CourseGrid courses={courses} onSelect={openEdit} />
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Edit course' : 'Add course'}
      >
        <CourseForm
          course={editing ?? undefined}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
          onCancel={() => setShowForm(false)}
        />
        {editing ? (
          <div className="mt-3 border-t border-surface-border pt-3">
            <Button variant="danger" size="sm" icon="close" onClick={() => void handleDelete(editing)}>
              Remove course
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
