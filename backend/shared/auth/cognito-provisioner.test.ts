// Unit tests for the Cognito-backed provisioner's from-invite path. The AWS SDK client is mocked so
// the real command-shaping + error mapping logic runs without AWS: we assert the AdminCreateUser
// attributes (incl. custom:studentId), the permanent-password set, and the UsernameExists→LoginNameTaken
// mapping.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-cognito-identity-provider', async (importActual) => {
  const actual = await importActual<typeof import('@aws-sdk/client-cognito-identity-provider')>();
  return { ...actual, CognitoIdentityProviderClient: vi.fn(() => ({ send: sendMock })) };
});

// Import AFTER the mock is registered.
const { cognitoProvisioner, LoginNameTakenError } = await import('./cognito-provisioner.js');

const attrs = (cmd: AdminCreateUserCommand): Record<string, string> =>
  Object.fromEntries((cmd.input.UserAttributes ?? []).map((a) => [a.Name!, a.Value!]));

beforeEach(() => sendMock.mockReset());

describe('cognitoProvisioner.provisionFromInvite', () => {
  it('creates a student login with custom:role, custom:tenantId, custom:studentId + permanent password', async () => {
    sendMock.mockResolvedValue({});
    const p = cognitoProvisioner('pool-1', 'us-east-2');
    await p.provisionFromInvite({
      loginName: 'keira',
      password: 'Password123!',
      tenantId: 'fam1',
      role: 'student',
      studentId: 'stu-9',
    });

    const create = sendMock.mock.calls[0]![0] as AdminCreateUserCommand;
    expect(create).toBeInstanceOf(AdminCreateUserCommand);
    expect(create.input.Username).toBe('keira');
    expect(create.input.MessageAction).toBe('SUPPRESS');
    expect(attrs(create)).toEqual({
      'custom:role': 'student',
      'custom:tenantId': 'fam1',
      'custom:studentId': 'stu-9',
    });

    const setPw = sendMock.mock.calls[1]![0] as AdminSetUserPasswordCommand;
    expect(setPw).toBeInstanceOf(AdminSetUserPasswordCommand);
    expect(setPw.input.Username).toBe('keira');
    expect(setPw.input.Permanent).toBe(true);
  });

  it('omits custom:studentId for a non-student (coparent → parent) login', async () => {
    sendMock.mockResolvedValue({});
    const p = cognitoProvisioner('pool-1');
    await p.provisionFromInvite({ loginName: 'dad', password: 'Password123!', tenantId: 'fam1', role: 'parent' });
    const create = sendMock.mock.calls[0]![0] as AdminCreateUserCommand;
    expect(attrs(create)).toEqual({ 'custom:role': 'parent', 'custom:tenantId': 'fam1' });
    expect(create.input.UserAttributes!.some((a) => a.Name === 'custom:studentId')).toBe(false);
  });

  it('maps UsernameExistsException to LoginNameTakenError (so the invitee can retry)', async () => {
    sendMock.mockRejectedValueOnce(new UsernameExistsException({ message: 'taken', $metadata: {} }));
    const p = cognitoProvisioner('pool-1');
    await expect(
      p.provisionFromInvite({ loginName: 'taken', password: 'Password123!', tenantId: 'fam1', role: 'member' }),
    ).rejects.toBeInstanceOf(LoginNameTakenError);
    expect(sendMock).toHaveBeenCalledTimes(1); // never reached the password set
  });
});
