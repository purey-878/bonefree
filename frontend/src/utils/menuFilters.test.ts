import { describe, expect, it } from 'vitest';
import { restoreMenuPriceRange } from './menuFilters';

describe('saved menu price bounds', () => {
  it('restores a full-range slider as unbounded to avoid a redundant capped request on navigation', () => {
    expect(restoreMenuPriceRange([0, 12.5], 12.5)).toEqual([0, 1000]);
  });
  it('preserves an intentional price cap and minimum', () => {
    expect(restoreMenuPriceRange([2, 8.25], 12.5)).toEqual([2, 8.25]);
    expect(restoreMenuPriceRange([2, 12.5], 12.5)).toEqual([2, 1000]);
  });
  it('preserves legacy saved ranges without guessing whether their maximum was a filter', () => {
    expect(restoreMenuPriceRange([3, 8])).toEqual([3, 8]);
  });
  it('tolerates malformed storage and an empty catalog', () => {
    expect(restoreMenuPriceRange(null)).toEqual([0, 1000]);
    expect(restoreMenuPriceRange(['bad', 'bad'], 'bad')).toEqual([0, 1000]);
    expect(restoreMenuPriceRange([-1, 0], 0)).toEqual([0, 0]);
  });
});
