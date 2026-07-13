// @vitest-environment jsdom
// Admin-only Usage page: pins the contract that matters — an admin sees the headline total plus a
// per-bucket row from a mocked getUsage, switching the groupBy control refetches with the new
// dimension, and a non-admin gets an "admins only" empty state and NEVER hits the API.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { FamiliesUsageResponse, ReconciliationResponse, UsageResponse } from './types';

const h = vi.hoisted(() => ({
  getUsage: vi.fn(),
  getFamiliesUsage: vi.fn(),
  getReconciliation: vi.fn(),
  user: { username: 'kate', role: 'admin', tenantId: 'fam1', platformAdmin: false } as {
    username: string;
    role: string;
    tenantId?: string;
    platformAdmin?: boolean;
  },
}));

vi.mock('./api', () => ({
  getUsage: h.getUsage,
  getFamiliesUsage: h.getFamiliesUsage,
  getReconciliation: h.getReconciliation,
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
  Table: ({ columns, rows, rowKey, onRowClick }: any) => (
    <table>
      <tbody>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {rows.map((r: any) => (
          <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}>
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

const FAMILIES: FamiliesUsageResponse = {
  families: [
    { tenantId: 'fam2', familyName: 'Beta', costMicros: 2_000_000, inputTokens: 200, outputTokens: 80, calls: 5 },
    { tenantId: 'fam1', familyName: 'Alpha', costMicros: 1_500_000, inputTokens: 100, outputTokens: 40, calls: 3 },
  ],
  totalCostMicros: 3_500_000,
  totalInputTokens: 300,
  totalOutputTokens: 120,
};

const RECON_BREACH: ReconciliationResponse = {
  month: '2026-07',
  appCostMicros: 1_000_000,
  awsCostMicros: 950_000,
  driftPct: 5.3,
  appTokens: 140,
  awsTokens: 138,
  breach: true,
  actualsAvailable: true,
  computedAt: '2026-07-13T07:00:00.000Z',
  caveat: 'account-total incl. staging noise; Cost Explorer ~24h delayed',
};

const RECON_ACTUALS_UNAVAILABLE: ReconciliationResponse = {
  month: '2026-07',
  appCostMicros: 1_000_000,
  awsCostMicros: null,
  driftPct: null,
  appTokens: 140,
  awsTokens: null,
  breach: false,
  actualsAvailable: false,
  computedAt: '2026-07-13T07:00:00.000Z',
  caveat: 'account-total incl. staging noise; Cost Explorer ~24h delayed',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { username: 'kate', role: 'admin', tenantId: 'fam1', platformAdmin: false };
  h.getUsage.mockResolvedValue(RESPONSE);
  h.getFamiliesUsage.mockResolvedValue(FAMILIES);
  h.getReconciliation.mockResolvedValue({ month: '2026-07', status: 'not_computed' });
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

  it('tenant admin goes straight to the own-family breakdown, never calling getFamiliesUsage', async () => {
    render(<AdminUsagePage />);
    await waitFor(() => expect(h.getUsage).toHaveBeenCalledTimes(1));
    expect(h.getFamiliesUsage).not.toHaveBeenCalled();
  });

  it('platform admin sees the ranked All families view by default', async () => {
    h.user = { username: 'grahem', role: 'admin', tenantId: 'fam1', platformAdmin: true };
    render(<AdminUsagePage />);
    await waitFor(() => expect(h.getFamiliesUsage).toHaveBeenCalledTimes(1));
    // ranked family rows: family name + cost; grand total headline
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('$3.50')).toBeTruthy(); // grand total
    // the per-family breakdown is NOT fetched until a family is selected
    expect(h.getUsage).not.toHaveBeenCalled();
  });

  it('platform admin clicking a family row drills into that family’s breakdown', async () => {
    h.user = { username: 'grahem', role: 'admin', tenantId: 'fam1', platformAdmin: true };
    render(<AdminUsagePage />);
    await waitFor(() => expect(screen.getByText('Beta')).toBeTruthy());
    fireEvent.click(screen.getByText('Beta'));
    await waitFor(() =>
      expect(h.getUsage).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'fam2' })),
    );
  });

  it('platform admin sees the reconciliation drift panel when a status row exists', async () => {
    h.user = { username: 'grahem', role: 'admin', tenantId: 'fam1', platformAdmin: true };
    h.getReconciliation.mockResolvedValue(RECON_BREACH);
    render(<AdminUsagePage />);
    await waitFor(() => expect(screen.getByText('Drift detected')).toBeTruthy());
    expect(screen.getByText('5.3%')).toBeTruthy();
    expect(screen.getByText('$1.00')).toBeTruthy(); // app cost
    expect(screen.getByText('$0.95')).toBeTruthy(); // AWS cost
    expect(screen.getByText(/Cost Explorer/)).toBeTruthy(); // caveat
  });

  it('platform admin sees an "actuals unavailable" state (not a misleading $0 drift)', async () => {
    h.user = { username: 'grahem', role: 'admin', tenantId: 'fam1', platformAdmin: true };
    h.getReconciliation.mockResolvedValue(RECON_ACTUALS_UNAVAILABLE);
    render(<AdminUsagePage />);
    await waitFor(() => expect(screen.getByText('Actuals unavailable')).toBeTruthy());
    expect(screen.getByText(/AWS actuals unavailable for this run/i)).toBeTruthy();
    expect(screen.getByText('$1.00')).toBeTruthy(); // app cost still shown
    expect(screen.queryByText('Drift detected')).toBeNull();
    expect(screen.queryByText('Within threshold')).toBeNull();
  });

  it('platform admin sees "not yet computed" when reconciliation has not run (staging)', async () => {
    h.user = { username: 'grahem', role: 'admin', tenantId: 'fam1', platformAdmin: true };
    h.getReconciliation.mockResolvedValue({ month: '2026-07', status: 'not_computed' });
    render(<AdminUsagePage />);
    await waitFor(() => expect(screen.getByText(/not yet computed/i)).toBeTruthy());
  });

  it('tenant admin never fetches reconciliation', async () => {
    render(<AdminUsagePage />);
    await waitFor(() => expect(h.getUsage).toHaveBeenCalledTimes(1));
    expect(h.getReconciliation).not.toHaveBeenCalled();
  });
});
