import { describe, expect, it } from 'vitest';
import { PUBLIC_PATHS } from './metadata';
import { catalogSnapshotPaths } from './catalogSnapshot';
const now = Date.parse('2026-11-08T12:00:00Z');
const capturedAt = new Date(now).toISOString();
describe('verified catalog sitemap', () => {
  it('emits only verified numeric product URLs, including an empty catalog', () => {
    expect(catalogSnapshotPaths({ capturedAt, productIds: [12, 75] }, now)).toEqual(['/product/12', '/product/75']);
    expect(catalogSnapshotPaths({ capturedAt, productIds: [] }, now)).toEqual([]);
  });
  it('reserves sitemap capacity for every public page', () => {
    const productIds = Array.from({ length: 50_000 - PUBLIC_PATHS.length }, (_, i) => i + 1);
    expect(catalogSnapshotPaths({ capturedAt, productIds }, now).length + PUBLIC_PATHS.length).toBe(50_000);
    expect(() => catalogSnapshotPaths({ capturedAt, productIds: [...productIds, 50_001] }, now)).toThrow();
  });
  it('rejects stale, future, malformed or duplicate entries', () => {
    for (const value of [null, {}, { capturedAt: '2020-01-01', productIds: [1] }, { capturedAt: new Date(now + 120000).toISOString(), productIds: [1] }, ...[[0], [-1], ['2'], [1, 1], [1.5], ['<script>']].map(productIds => ({ capturedAt, productIds }))]) {
      expect(() => catalogSnapshotPaths(value, now)).toThrow();
    }
  });
});
