import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import i18n, { DEFAULT_LOCALE, i18nReady } from '../i18n';
import { ApiError, isApiErrorWithStatus, toApiError } from './errors';

describe('ApiError', () => {
  let previousLanguage: string;

  beforeEach(async () => {
    await i18nReady;
    previousLanguage = i18n.language;
    await i18n.changeLanguage(DEFAULT_LOCALE);
  });

  afterEach(async () => {
    await i18n.changeLanguage(previousLanguage);
  });

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

  it.each([
    ['pt-PT', 'Email ou palavra-passe inválidos.', 'Tem de iniciar sessão para continuar.'],
    ['en-GB', 'Invalid email or password.', 'You need to sign in to continue.'],
    ['de-DE', 'Ungültige E-Mail-Adresse oder ungültiges Passwort.', 'Sie müssen sich anmelden, um fortzufahren.'],
  ])('translates invalid login credentials without treating them as a missing session (%s)', async (locale, expected, sessionMessage) => {
    await i18n.changeLanguage(locale);
    const error = toApiError({
      detail: {
        error: 'invalid_credentials',
        message: 'Invalid email or password.',
      },
    }, 401);

    expect(error.message).toBe(expected);
    expect(error.code).toBe('invalid_credentials');
    expect(error.status).toBe(401);

    const sessionError = toApiError({
      detail: { error: 'authentication_required', message: 'Authentication required.' },
    }, 401);
    expect(sessionError.message).toBe(sessionMessage);
    expect(sessionError.code).toBe('authentication_required');
    expect(sessionError.status).toBe(401);
    expect(error.message).not.toBe(sessionError.message);
  });
});
