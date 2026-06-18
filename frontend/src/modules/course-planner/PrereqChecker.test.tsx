// @vitest-environment jsdom
// The prereq checker picks from the student's tracked colleges (a dropdown) rather than asking for a
// raw college id. This locks that: the roster populates the select, picking one auto-runs the check
// (no submit button), and the per-prereq report renders with course names.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  listColleges: vi.fn(),
  getPrerequisites: vi.fn(),
}));

vi.mock('../college-hub/api', () => ({ listColleges: h.listColleges }));
vi.mock('./api', () => ({ getPrerequisites: h.getPrerequisites }));

import { PrereqChecker } from './PrereqChecker';

const courses = [
  { courseId: 'crs-1', name: 'Algebra II', createdAt: '', updatedAt: '' },
  { courseId: 'crs-2', name: 'Chemistry', createdAt: '', updatedAt: '' },
];

beforeEach(() => {
  h.listColleges.mockReset();
  h.getPrerequisites.mockReset();
});

describe('PrereqChecker', () => {
  it('populates a dropdown from the roster and auto-checks the picked college', async () => {
    const user = userEvent.setup();
    h.listColleges.mockResolvedValue([
      { collegeId: 'c-purdue', name: 'Purdue University', createdAt: '', updatedAt: '' },
      { collegeId: 'c-uf', name: 'University of Florida', createdAt: '', updatedAt: '' },
    ]);
    h.getPrerequisites.mockResolvedValue({
      collegeId: 'c-uf',
      collegeName: 'University of Florida',
      satisfiedCount: 1,
      totalCount: 2,
      gaps: ['Physics'],
      prerequisites: [
        { name: 'Algebra II', satisfied: true, satisfiedByCourseIds: ['crs-1'] },
        { name: 'Physics', satisfied: false, satisfiedByCourseIds: [] },
      ],
    });

    render(<PrereqChecker courses={courses} />);

    // Roster loads into the select — no raw id field.
    await waitFor(() => expect(screen.getByRole('option', { name: 'Purdue University' })).toBeTruthy());
    expect(screen.queryByPlaceholderText(/college's id/i)).toBeNull();

    // Picking a college runs the check with that college's id (no submit button needed).
    await user.selectOptions(screen.getByRole('combobox'), 'c-uf');
    await waitFor(() => expect(h.getPrerequisites).toHaveBeenCalledWith('c-uf'));

    // The detailed report renders: the met count, a satisfied prereq (by course name), and a gap.
    expect(await screen.findByText('1 / 2 met')).toBeTruthy();
    expect(screen.getByText(/Satisfied by Algebra II/)).toBeTruthy();
    expect(screen.getByText(/Not covered yet/)).toBeTruthy();
  });

  it('shows an add-colleges hint when the roster is empty', async () => {
    h.listColleges.mockResolvedValue([]);
    render(<PrereqChecker courses={courses} />);
    expect(await screen.findByText(/No colleges to check yet/i)).toBeTruthy();
    expect(h.getPrerequisites).not.toHaveBeenCalled();
  });
});
