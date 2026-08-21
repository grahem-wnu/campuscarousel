// @vitest-environment jsdom
// This is the only self-service password path in the app — the pool has no email recovery — so the
// failure modes matter: a wrong current password must say so clearly, and a typed password must
// never survive a closed dialog.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ changePassword: vi.fn() }));
vi.mock('./amplify', () => ({ changePassword: h.changePassword }));

import { ChangePasswordModal } from './ChangePasswordModal';

beforeEach(() => h.changePassword.mockReset());

const type = async (label: string, value: string) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};

const fill = async (current: string, next: string, confirm = next) => {
  await type('Current password', current);
  await type('New password', next);
  await type('Confirm new password', confirm);
};

const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByText('Change password', { selector: 'button' }));
    await Promise.resolve();
  });
};

describe('ChangePasswordModal', () => {
  it('changes the password and confirms it worked', async () => {
    h.changePassword.mockResolvedValue({ status: 'ok' });
    render(<ChangePasswordModal open onClose={vi.fn()} />);

    await fill('oldpass1', 'newpass1');
    await submit();

    expect(h.changePassword).toHaveBeenCalledWith('oldpass1', 'newpass1');
    expect(screen.getByText(/password has been changed/)).toBeTruthy();
  });

  it('says plainly when the current password is wrong', async () => {
    h.changePassword.mockResolvedValue({ status: 'error', message: "That current password isn't right." });
    render(<ChangePasswordModal open onClose={vi.fn()} />);

    await fill('wrong', 'newpass1');
    await submit();

    expect(screen.getByRole('alert').textContent).toContain("current password isn't right");
  });

  it('catches a mismatched confirmation without a round trip', async () => {
    render(<ChangePasswordModal open onClose={vi.fn()} />);

    await fill('oldpass1', 'newpass1', 'newpass2');
    await submit();

    expect(h.changePassword).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain("don't match");
  });

  it('enforces the same minimum length Cognito does, rather than a stricter invented one', async () => {
    render(<ChangePasswordModal open onClose={vi.fn()} />);

    await fill('oldpass1', 'abc');
    await submit();

    expect(h.changePassword).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('at least 6 characters');
  });

  it('refuses a "new" password that is the current one', async () => {
    render(<ChangePasswordModal open onClose={vi.fn()} />);

    await fill('samepass', 'samepass');
    await submit();

    expect(h.changePassword).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('same as your current password');
  });

  it('keeps submit disabled until all three fields have something in them', async () => {
    render(<ChangePasswordModal open onClose={vi.fn()} />);
    const button = screen.getByText('Change password', { selector: 'button' }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    await fill('oldpass1', 'newpass1');
    expect(button.disabled).toBe(false);
  });

  it('does not leave a typed password sitting in a closed dialog', async () => {
    const { rerender } = render(<ChangePasswordModal open onClose={vi.fn()} />);
    await fill('oldpass1', 'newpass1');

    await act(async () => {
      rerender(<ChangePasswordModal open={false} onClose={vi.fn()} />);
    });
    await act(async () => {
      rerender(<ChangePasswordModal open onClose={vi.fn()} />);
    });

    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
  });

  it('uses password inputs, so nothing is shown on screen or captured by autofill as text', () => {
    render(<ChangePasswordModal open onClose={vi.fn()} />);
    for (const label of ['Current password', 'New password', 'Confirm new password']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).type).toBe('password');
    }
  });
});
