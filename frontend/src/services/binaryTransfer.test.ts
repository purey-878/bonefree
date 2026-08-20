import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminApiClient } from '../api/clients';
import { uploadProductImage } from './adminService';
import { contentDispositionFilename } from './checkoutService';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('uploads and downloads', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  });

  it('extracts regular and UTF-8 download filenames', () => {
    expect(contentDispositionFilename(
      new Response(null, { headers: { 'Content-Disposition': 'attachment; filename="receipt-42.pdf"' } }),
      'fallback.pdf',
    )).toBe('receipt-42.pdf');
    expect(contentDispositionFilename(
      new Response(null, { headers: { 'Content-Disposition': "attachment; filename*=UTF-8''fatura%2042.pdf" } }),
      'fallback.pdf',
    )).toBe('fatura 42.pdf');
  });

  it('sends product images as authenticated multipart data', async () => {
    localStorage.setItem('admin_token', 'admin-secret');
    let capturedRequest: Request | undefined;
    const fetchMock = vi.fn(async (request: Request) => {
      capturedRequest = request;
      return new Response(JSON.stringify({
        message: 'uploaded',
        filename: 'burger.png',
        image_path: '/uploads/burger.png',
        url: '/uploads/burger.png',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    adminApiClient.setConfig({ baseUrl: 'https://api.example.test', fetch: fetchMock });

    const result = await uploadProductImage(9, new File(['image'], 'burger.png', { type: 'image/png' }));

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.get('Authorization')).toBe('Bearer admin-secret');
    expect(capturedRequest?.headers.get('Content-Type')).toContain('multipart/form-data');
    expect(capturedRequest?.url).toContain('/admin/products/9/image?replace_existing=true');
    expect(result.imagePath).toBe('/uploads/burger.png');
  });
});
