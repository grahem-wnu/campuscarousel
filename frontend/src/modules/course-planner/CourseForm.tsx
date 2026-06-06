import { useState, type FormEvent } from 'react';
import { Button, Field, Select, Textarea, TextField, useToast } from '../../shared/ui';
import { createCourse, updateCourse } from './api';
import type { Course, CourseInput, CourseType, Semester, Subject, Year } from './types';
import { COURSE_TYPES, SEMESTERS, SUBJECTS, YEARS } from './types';

const TYPE_LABEL: Record<CourseType, string> = {
  regular: 'Regular',
  honors: 'Honors',
  AP: 'AP',
  'dual-enrollment': 'Dual Enrollment',
};
const SUBJECT_LABEL: Record<Subject, string> = {
  math: 'Math',
  science: 'Science',
  english: 'English',
  'social-studies': 'Social Studies',
  'world-language': 'World Language',
  elective: 'Elective',
  'health-sciences': 'Health Sciences',
};
const YEAR_LABEL: Record<Year, string> = {
  freshman: 'Freshman',
  sophomore: 'Sophomore',
  junior: 'Junior',
  senior: 'Senior',
};
const SEMESTER_LABEL: Record<Semester, string> = {
  fall: 'Fall',
  spring: 'Spring',
  'full-year': 'Full Year',
  summer: 'Summer',
};

export interface CourseFormProps {
  /** When set, the form edits this course; otherwise it creates a new one. */
  course?: Course;
  onSaved?: (course: Course) => void;
  onCancel?: () => void;
}

/** Create / edit a course. Courses are family-visible, so any signed-in user may save. */
export function CourseForm({ course, onSaved, onCancel }: CourseFormProps) {
  const toast = useToast();
  const editing = Boolean(course);

  const [name, setName] = useState(course?.name ?? '');
  const [type, setType] = useState<CourseType | ''>(course?.type ?? '');
  const [subject, setSubject] = useState<Subject | ''>(course?.subject ?? '');
  const [year, setYear] = useState<Year | ''>(course?.year ?? '');
  const [semester, setSemester] = useState<Semester | ''>(course?.semester ?? '');
  const [grade, setGrade] = useState(course?.grade ?? '');
  const [units, setUnits] = useState(course?.units != null ? String(course.units) : '');
  const [notes, setNotes] = useState(course?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Give the course a name.');
      return;
    }
    const unitsNum = units.trim() ? Number(units) : undefined;
    if (unitsNum !== undefined && (Number.isNaN(unitsNum) || unitsNum < 0)) {
      toast.error('Units must be a non-negative number.');
      return;
    }
    setSaving(true);
    try {
      const input: CourseInput = {
        name: name.trim(),
        type: type || undefined,
        subject: subject || undefined,
        year: year || undefined,
        semester: semester || undefined,
        grade: grade.trim() || undefined,
        units: unitsNum,
        notes: notes.trim() || undefined,
      };
      const saved = course ? await updateCourse(course.courseId, input) : await createCourse(input);
      toast.success(editing ? 'Course updated.' : 'Course added.');
      onSaved?.(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the course.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <TextField
        label="Course name"
        required
        placeholder="e.g. AP Biology"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as CourseType | '')}>
            <option value="">—</option>
            {COURSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject">
          <Select value={subject} onChange={(e) => setSubject(e.target.value as Subject | '')}>
            <option value="">—</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Year">
          <Select value={year} onChange={(e) => setYear(e.target.value as Year | '')}>
            <option value="">—</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {YEAR_LABEL[y]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Semester">
          <Select value={semester} onChange={(e) => setSemester(e.target.value as Semester | '')}>
            <option value="">—</option>
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>
                {SEMESTER_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Grade"
          hint="Leave blank for a planned / in-progress course."
          placeholder="e.g. A, B+"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        />
        <TextField
          label="Units"
          type="number"
          min={0}
          step="0.5"
          placeholder="e.g. 1"
          value={units}
          onChange={(e) => setUnits(e.target.value)}
        />
      </div>

      <Field label="Notes" hint="Optional.">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving} icon={editing ? 'check' : 'plus'}>
          {editing ? 'Save changes' : 'Add course'}
        </Button>
      </div>
    </form>
  );
}
