import { describe, it, expect } from 'vitest';
import { validate, validateBody, z } from './index.js';
import { ApiError } from './errors.js';
import type { HandlerContext } from './types.js';

const schema = z.object({ title: z.string().min(1), hours: z.number().int().positive() });

describe('validate', () => {
  it('returns the typed value on success', () => {
    expect(validate(schema, { title: 'Shadowing', hours: 4 })).toEqual({ title: 'Shadowing', hours: 4 });
  });

  it('throws a 422 ApiError listing the failing fields', () => {
    try {
      validate(schema, { title: '', hours: -1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.status).toBe(422);
      expect(e.code).toBe('validation');
      expect(e.message).toMatch(/title/);
      expect(e.message).toMatch(/hours/);
    }
  });

  it('validateBody reads ctx.body', () => {
    const ctx = { body: { title: 'X', hours: 1 } } as HandlerContext;
    expect(validateBody(schema, ctx)).toEqual({ title: 'X', hours: 1 });
  });
});
