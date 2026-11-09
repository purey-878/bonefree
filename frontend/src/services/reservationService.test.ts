import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicApiClient, adminApiClient } from '../api/clients';
import { publicCachedFetch, adminDeduplicatedFetch, publicRequestCache } from '../api/requestCache';
import { newBookingKey, reservationService } from './reservationService';
beforeEach(() => {
  publicRequestCache.invalidate();
  publicApiClient.setConfig({ baseUrl: 'https://api.test', fetch: publicCachedFetch });
  adminApiClient.setConfig({ baseUrl: 'https://api.test', fetch: adminDeduplicatedFetch });
  vi.stubGlobal('localStorage', { getItem: () => 'owner-private-token' });
});
afterEach(() => vi.unstubAllGlobals());
describe('reservation API adapter security and contracts', () => {
  it('uses cryptographic, unique 256-bit retry keys', () => {
    const first = newBookingKey(); expect(first).toMatch(/^[a-f0-9]{64}$/); expect(first).not.toBe(newBookingKey());
  });
  it('never shares cached settings, availability or private confirmation responses', async () => {
    const network = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', network);
    await reservationService.settings(); await reservationService.settings();
    await reservationService.availability('2027-01-01', 2, 'en-GB'); await reservationService.availability('2027-01-01', 2, 'en-GB');
    await reservationService.confirmation({ token: 'a'.repeat(64), locale: 'en-GB' }); await reservationService.confirmation({ token: 'a'.repeat(64), locale: 'en-GB' });
    expect(network).toHaveBeenCalledTimes(6);
    const requests = network.mock.calls as unknown as [Request][];
    for (const [request] of requests) expect(request.url).not.toContain('a'.repeat(64));
  });
  it('sends optional contacts and a stable retry key through the generated client', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (request: Request) => { requests.push(request.clone()); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); });
    const body = { name: 'Ana', day: '2027-01-01', time: '19:00', guests: 2, email: null, phone: null, idempotency_key: newBookingKey() };
    await reservationService.create(body,'pt-PT'); await reservationService.create(body,'pt-PT');
    expect(await requests[0].json()).toEqual(body); expect(await requests[1].json()).toEqual(body);
    expect(requests[0].method).toBe('POST'); expect(requests[0].headers.has('Authorization')).toBe(false);
  });
  it('downloads an actual PDF blob using a token in the body and no-store', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (request: Request) => { requests.push(request.clone()); return new Response('%PDF-1.4\nfixture', { headers: { 'Content-Type': 'application/pdf' } }); });
    const token = 'b'.repeat(64);
    const pdf = await reservationService.pdf({ token, locale: 'de-DE' });
    expect(pdf).toBeInstanceOf(Blob); expect(await pdf.text()).toContain('%PDF');
    expect(requests[0].url).not.toContain(token); expect(await requests[0].json()).toEqual({ token, locale: 'de-DE' });
    expect(requests[0].cache).toBe('no-store');
  });
  it('cancels through a private POST body without bearer authentication or caching', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (request: Request) => { requests.push(request.clone()); return new Response('{"status":"cancelled","can_cancel":false}', { headers: { 'Content-Type': 'application/json' } }); });
    const body = { token: 'c'.repeat(64), locale: 'en-GB' as const };
    const result = await reservationService.cancel(body);
    await reservationService.cancel(body);
    expect(result.status).toBe('cancelled');
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toBe('https://api.test/reservations/confirmation/cancel');
      expect(request.method).toBe('POST');
      expect(request.headers.has('Authorization')).toBe(false);
      expect(request.cache).toBe('no-store');
      expect(await request.json()).toEqual(body);
    }
  });
  it('saves loaded promotions and repeated edits without sending response-only fields', async () => {
    const requests: Request[] = [];
    const body = { title: 'Original offer', description: 'Lunch offer', scope: 'Menu', conditions: 'Weekdays only', percentage: '30.00', start_date: '2027-01-01', end_date: '2027-02-01', enabled: true, automatic: true, weekdays: [0, 1, 2, 3], windows: [{ start: '12:00', end: '15:00' }], translations: { 'en-GB': { title: 'English offer', scope: 'Menu', conditions: 'Lunch only' } } };
    vi.stubGlobal('fetch', async (request: Request) => {
      requests.push(request.clone());
      return new Response(JSON.stringify({ ...await request.json(), id: 1 }), { headers: { 'Content-Type': 'application/json' } });
    });
    const loaded = { ...body, id: 1, server_metadata: 'response only' };
    const saved = await reservationService.savePromotion(loaded, loaded.id);
    await reservationService.savePromotion({ ...saved, title: 'Edited again', enabled: false }, saved.id);
    await reservationService.savePromotion(loaded);
    expect(requests).toHaveLength(3);
    expect(requests[0].method).toBe('PUT');
    expect(requests[0].url).toBe('https://api.test/admin/reservations/promotions/1');
    expect(await requests[0].json()).toEqual(body);
    expect(await requests[1].json()).toEqual({ ...body, title: 'Edited again', enabled: false });
    expect(requests[2].method).toBe('POST');
    expect(await requests[2].json()).toEqual(body);
    expect(requests.every(request => request.headers.get('Authorization') === 'Bearer owner-private-token')).toBe(true);
  });
  it('keeps admin reads private and invalidates completed reads after status updates', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (request: Request) => { requests.push(request.clone()); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); });
    await reservationService.list({ page: 1 }); await reservationService.status(2,'cancelled'); await reservationService.list({ page: 1 });
    expect(requests).toHaveLength(3); expect(requests.every(request=>request.headers.get('Authorization') === 'Bearer owner-private-token')).toBe(true);
    expect(await requests[1].json()).toEqual({ status:'cancelled' });
  });
});
