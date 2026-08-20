import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminManagementReadCurrentAdmin, authGetMe } from './generated';
import { adminApiClient, customerApiClient, publicApiClient } from './clients';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('generated API clients', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('selects the customer and admin tokens without leaking one into the public client', async () => {
    localStorage.setItem('token', 'customer-secret');
    localStorage.setItem('admin_token', 'admin-secret');
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (request: Request) => {
      requests.push(request);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    for (const client of [publicApiClient, customerApiClient, adminApiClient]) {
      client.setConfig({ baseUrl: 'https://api.example.test', fetch: fetchMock });
    }

    await authGetMe({ client: publicApiClient, throwOnError: true });
    await authGetMe({ client: customerApiClient, throwOnError: true });
    await adminManagementReadCurrentAdmin({ client: adminApiClient, throwOnError: true });

    expect(requests[0].headers.get('Authorization')).toBeNull();
    expect(requests[1].headers.get('Authorization')).toBe('Bearer customer-secret');
    expect(requests[2].headers.get('Authorization')).toBe('Bearer admin-secret');
  });
});
