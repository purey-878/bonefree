import { describe, expect, it } from 'vitest';

import { ApiError, toApiError } from './errors';

describe('ApiError', () => {
  it('preserves status, code and validation fields', () => {
    const error = toApiError({
      detail: {
        error: 'validation_error',
        message: 'Invalid request',
        details: { fields: [{ field: 'email', message: 'Invalid email' }] },
      },
    }, 422);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_error');
    expect(error.fields).toHaveLength(1);
    expect(error.message).toBeTruthy();
  });

  it('returns an existing ApiError unchanged', () => {
    const original = new ApiError('Already translated', { status: 409 });
    expect(toApiError(original)).toBe(original);
  });
});
