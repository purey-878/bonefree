import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminManagementReadCurrentAdmin, authGetMe, checkoutGetOrder } from './generated';
import { adminApiClient, customerApiClient, publicApiClient, setOrganizationSlug } from './clients';
import { clearOrganizationStorageContextForTests } from '../core/storage/organizationStorage';
import { authService } from '../services/authService';

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
    clearOrganizationStorageContextForTests();
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

  it('sends a guest order token alongside a later customer session without putting it in the URL', async () => {
    localStorage.setItem('token', 'later-customer-session');
    let capturedRequest: Request | undefined;
    const fetchMock = vi.fn(async (request: Request) => {
      capturedRequest = request;
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    customerApiClient.setConfig({ baseUrl: 'https://api.example.test', fetch: fetchMock });

    await checkoutGetOrder({
      path: { order_id: 42 },
      headers: { 'X-Order-Token': 'guest-order-secret' },
      client: customerApiClient,
      throwOnError: true,
    });

    expect(capturedRequest?.headers.get('Authorization')).toBe('Bearer later-customer-session');
    expect(capturedRequest?.headers.get('X-Order-Token')).toBe('guest-order-secret');
    expect(capturedRequest?.url).toBe('https://api.example.test/checkout/orders/42');
    expect(capturedRequest?.url).not.toContain('guest-order-secret');
  });

  it('adds the resolved organization slug to every client', async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (request: Request) => {
      requests.push(request);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    for (const client of [publicApiClient, customerApiClient, adminApiClient]) {
      client.setConfig({ baseUrl: 'https://api.example.test', fetch: fetchMock });
    }

    setOrganizationSlug('bonefree');
    await authGetMe({ client: publicApiClient, throwOnError: true });
    await authGetMe({ client: customerApiClient, throwOnError: true });
    await adminManagementReadCurrentAdmin({ client: adminApiClient, throwOnError: true });

    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.headers.get('X-Organization-Slug')).toBe('bonefree');
    }
  });

  it('omits empty purchase-history filters instead of serializing invalid query values', async () => {
    localStorage.setItem('token', 'customer-secret');
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (request: Request) => {
      requests.push(request);
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    customerApiClient.setConfig({ baseUrl: 'https://api.example.test', fetch: fetchMock });

    await authService.getPurchaseHistory({ status: '', payment: '', dateFrom: '', dateTo: '' });
    await authService.getPurchaseHistory({ status: 'ready', payment: '', dateFrom: '2026-08-01', dateTo: '' });

    expect(requests[0].url).toBe('https://api.example.test/profile/orders');
    expect(requests[1].url).toBe('https://api.example.test/profile/orders?status=ready&date_from=2026-08-01');
  });
});
