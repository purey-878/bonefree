import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentAdmin } from '../services/adminService';
import { productService } from '../services/productService';
import { adminApiClient, publicApiClient } from './clients';

describe('public and administrator API clients', () => {
  beforeEach(() => {
    const values = new Map([['token', 'old-customer-secret'], ['admin_token', 'admin-secret']]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('ignores old customer tokens and sends the admin token only on admin requests', async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (request: Request) => {
      requests.push(request);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    for (const client of [publicApiClient, adminApiClient]) client.setConfig({ baseUrl: 'https://api.example.test', fetch: fetchMock });
    await productService.getById(7);
    await getCurrentAdmin();
    expect(requests[0].url).toBe('https://api.example.test/products/7');
    expect(requests[0].headers.get('Authorization')).toBeNull();
    expect(requests[1].headers.get('Authorization')).toBe('Bearer admin-secret');
    expect(requests.every(request => !request.url.includes('secret'))).toBe(true);
  });
});
