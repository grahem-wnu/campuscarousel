// @vitest-environment jsdom
// Admin-only Usage page: pins the contract that matters — an admin sees the headline total plus a
// per-bucket row from a mocked getUsage, switching the groupBy control refetches with the new
// dimension, and a non-admin gets an "admins only" empty state and NEVER hits the API.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { UsageResponse } from './types';

const h = vi.hoisted(() => ({
  getUsage: vi.fn(),
  user: { username: 'kate', role: 'admin', tenantId: 'fam1', platformAdmin: false } as {
    username: string;
    role: string;
    tenantId?: string;
    platformAdmin?: boolean;
  },
}));

vi.mock('./api', () => ({
  getUsage: h.getUsage,
  formatUsd: (m: number) => `$${(m / 1_000_000).toFixed(2)}`,
}));
vi.mock('../../shared/shell', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../../shared/ui', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Spinner: () => <div>loading…</div>,
  EmptyState: ({ title, description }: { title?: ReactNode; description?: ReactNode }) => (
    <div>
      {title}
      {description}
    </div>
  ),
  Field: ({ label, children }: { label?: ReactNode; children: ReactNode }) => (
    <label>
      {label}
      {children}
    </label>
  ),
  Input: (props: Record<string, unknown>) => <input {...props} />,
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Icon: () => null,
  Select: ({
    children,
    value,
    onChange,
  }: {
    children: ReactNode;
    value?: string;
    onChange?: (e: unknown) => void;
  }) => (
    <select aria-label="group by" value={value} onChange={onChange}>
      {children}
    </select>
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Table: ({ columns, rows, rowKey }: any) => (
    <table>
      <tbody>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {rows.map((r: any) => (
          <tr key={rowKey(r)}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {columns.map((c: any) => (
              <td key={c.key}>{c.render(r)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

import AdminUsagePage from './AdminUsagePage';

const RESPONSE: UsageResponse = {
  tenantId: 'fam1',
  groupBy: 'feature',
  totalCostMicros: 1_500_000,
  totalInputTokens: 100,
  totalOutputTokens: 40,
  buckets: [{ key: 'focus', costMicros: 900_000, inputTokens: 60, outputTokens: 24, calls: 3 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { username: 'kate', role: 'admin', tenantId: 'fam1', platformAdmin: false };
  h.getUsage.mockResolvedValue(RESPONSE);
});

describe('AdminUsagePage', () => {
  it('renders the headline total and a bucket row for an admin', async () => {
    render(<AdminUsagePage />);
    // headline total
    await waitFor(() => expect(screen.getByText('$1.50')).toBeTruthy());
    // bucket row: feature key + its cost
    expect(screen.getByText('focus')).toBeTruthy();
    expect(screen.getByText('$0.90')).toBeTruthy();
    expect(h.getUsage).toHaveBeenCalledWith(expect.objectContaining({ groupBy: 'feature' }));
  });

  it('refetches with the new dimension when the groupBy control changes', async () => {
    render(<AdminUsagePage />);
    await waitFor(() => expect(h.getUsage).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('group by'), { target: { value: 'day' } });
    await waitFor(() =>
      expect(h.getUsage).toHaveBeenLastCalledWith(expect.objectContaining({ groupBy: 'day' })),
    );
  });

  it('shows an "admins only" empty state and does NOT fetch for a non-admin', () => {
    h.user = { username: 'pat', role: 'parent', tenantId: 'fam1', platformAdmin: false };
    render(<AdminUsagePage />);
    expect(screen.getByText(/admins only/i)).toBeTruthy();
    expect(h.getUsage).not.toHaveBeenCalled();
  });
});
