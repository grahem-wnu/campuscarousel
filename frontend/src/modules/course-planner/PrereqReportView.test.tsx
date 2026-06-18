// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PrereqReportView } from './PrereqReportView';
import type { PrereqReport } from './types';

const report = (over: Partial<PrereqReport> = {}): PrereqReport => ({
  collegeId: 'c1',
  collegeName: 'Test U',
  satisfiedCount: 1,
  totalCount: 3,
  gaps: ['Anatomy & Physiology', 'Microbiology'],
  prerequisites: [
    { name: 'Chemistry', satisfied: true, satisfiedByCourseIds: ['crs1'] },
    { name: 'Anatomy & Physiology', satisfied: false, satisfiedByCourseIds: [] },
    { name: 'Microbiology', satisfied: false, satisfiedByCourseIds: [] },
  ],
  ...over,
});

describe('PrereqReportView', () => {
  it('lists gaps before satisfied prerequisites', () => {
    render(<PrereqReportView report={report()} />);
    const labels = screen.getAllByRole('listitem').map((li) => within(li).getByText(/Chemistry|Anatomy|Microbiology/).textContent);
    expect(labels).toEqual(['Anatomy & Physiology', 'Microbiology', 'Chemistry']);
  });

  it('resolves course names for satisfied items when a resolver is given', () => {
    render(<PrereqReportView report={report()} courseName={(id) => (id === 'crs1' ? 'AP Chem' : id)} />);
    expect(screen.getByText('Satisfied by AP Chem')).toBeInTheDocument();
  });

  it('shows a Refresh hint when the program has no prerequisites listed', () => {
    render(<PrereqReportView report={report({ prerequisites: [], gaps: [], satisfiedCount: 0, totalCount: 0 })} />);
    expect(screen.getByText(/No prerequisites are listed/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
