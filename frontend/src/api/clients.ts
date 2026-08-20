import { createClient } from './generated/client';
import type { Client } from './generated/client';
import { toApiError } from './errors';

const DEFAULT_API_BASE = 'http://127.0.0.1:8000';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
  || DEFAULT_API_BASE;

export type TokenKind = 'token' | 'admin_token';

export function getStoredToken(kind: TokenKind): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  return localStorage.getItem(kind) ?? undefined;
}

function configureClient(client: Client): Client {
  client.interceptors.error.use((error, response) => toApiError(error, response?.status));
  return client;
}

export const publicApiClient = configureClient(createClient({ baseUrl: API_BASE }));

export const customerApiClient = configureClient(createClient({
  baseUrl: API_BASE,
  auth: () => getStoredToken('token'),
}));

export const adminApiClient = configureClient(createClient({
  baseUrl: API_BASE,
  auth: () => getStoredToken('admin_token'),
}));

export async function apiData<T>(request: Promise<{ data: T }>): Promise<T> {
  return (await request).data;
}
