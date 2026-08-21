import { describe, expect, it } from 'vitest';

import { ApiError, isApiErrorWithStatus, toApiError } from './errors';

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

  it('identifies only API errors with the requested HTTP status', () => {
    expect(isApiErrorWithStatus(new ApiError('Missing', { status: 404 }), 404)).toBe(true);
    expect(isApiErrorWithStatus(new ApiError('Server error', { status: 500 }), 404)).toBe(false);
    expect(isApiErrorWithStatus(new Error('Missing'), 404)).toBe(false);
  });

  it('translates invalid login credentials without treating them as a missing session', () => {
    const error = toApiError({
      detail: {
        error: 'invalid_credentials',
        message: 'Invalid email or password.',
      },
    }, 401);

    expect(error.message).toBe('Email ou palavra-passe inválidos.');
  });
});
