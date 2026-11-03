import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminApiClient } from '../api/clients';
import { uploadProductMedia } from './adminService';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('product media uploads', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  });

  it('sends product media as authenticated multipart data', async () => {
    localStorage.setItem('admin_token', 'admin-secret');
    let capturedRequest: Request | undefined;
    const fetchMock = vi.fn(async (request: Request) => {
      capturedRequest = request;
      return new Response(JSON.stringify({
        message: 'uploaded',
        media: {
          media_id: 12,
          sort_order: 0,
          is_primary: true,
          original_url: '/uploads/products/PRD-009/burger-original.webp',
          content_type: 'image/webp',
          variants: [],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    adminApiClient.setConfig({ baseUrl: 'https://api.example.test', fetch: fetchMock });

    const result = await uploadProductMedia(9, new File(['image'], 'burger.png', { type: 'image/png' }));

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.get('Authorization')).toBe('Bearer admin-secret');
    expect(capturedRequest?.headers.get('Content-Type')).toContain('multipart/form-data');
    expect(capturedRequest?.url).toContain('/admin/products/9/media?replace_existing=true');
    expect(result.media.originalUrl).toBe('/uploads/products/PRD-009/burger-original.webp');
  });
});
