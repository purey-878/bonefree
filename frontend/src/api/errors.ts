import { translateApiError, translateFieldError, translateUserMessage } from '../utils/messages';
import type { ApiErrorField } from '../utils/messages';

type ErrorPayload = {
  error?: string;
  message?: string;
  detail?: string | ErrorPayload;
  details?: { fields?: ApiErrorField[] };
};

export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly fields: ApiErrorField[];
  readonly payload?: unknown;

  constructor(message: string, options: { code?: string; status?: number; fields?: ApiErrorField[]; payload?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields ?? [];
    this.payload = options.payload;
  }
}

function isPayload(value: unknown): value is ErrorPayload {
  return typeof value === 'object' && value !== null;
}

export function toApiError(error: unknown, status?: number, fallback = 'Request failed'): ApiError {
  if (error instanceof ApiError) return error;

  const payload = isPayload(error) ? error : undefined;
  const nested = payload && isPayload(payload.detail) ? payload.detail : undefined;
  const code = nested?.error ?? payload?.error;
  const fields = payload?.details?.fields ?? nested?.details?.fields ?? [];
  const rawMessage = nested?.message
    ?? (typeof nested?.detail === 'string' ? nested.detail : undefined)
    ?? payload?.message
    ?? (typeof payload?.detail === 'string' ? payload.detail : undefined)
    ?? (error instanceof Error ? error.message : undefined)
    ?? fallback;
  const message = fields[0]
    ? translateFieldError(fields[0])
    : translateApiError(code, translateUserMessage(rawMessage));

  return new ApiError(message, { code, status, fields, payload: error });
}
