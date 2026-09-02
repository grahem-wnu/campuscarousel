// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLoginHint, peekLoginHint, rememberLoginHint } from './loginHint';

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('loginHint', () => {
  it('round-trips a hint; peek does not consume it; clear does', () => {
    rememberLoginHint({ username: 'parent@example.com', note: 'Sign in below.' });
    expect(peekLoginHint()).toEqual({ username: 'parent@example.com', note: 'Sign in below.' });
    // StrictMode runs state initializers twice — the second peek must still see it.
    expect(peekLoginHint()).toEqual({ username: 'parent@example.com', note: 'Sign in below.' });
    clearLoginHint();
    expect(peekLoginHint()).toBeNull();
  });

  it('is null when nothing was remembered or the stored value is junk', () => {
    expect(peekLoginHint()).toBeNull();
    window.sessionStorage.setItem('cc.loginHint', 'not json');
    expect(peekLoginHint()).toBeNull();
    window.sessionStorage.setItem('cc.loginHint', JSON.stringify({ note: 'no username' }));
    expect(peekLoginHint()).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => rememberLoginHint({ username: 'x' })).not.toThrow();
    set.mockRestore();
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(peekLoginHint()).toBeNull();
    get.mockRestore();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearLoginHint()).not.toThrow();
    remove.mockRestore();
  });
});
