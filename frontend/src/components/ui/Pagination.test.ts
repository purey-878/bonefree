import { describe, expect, it } from 'vitest';
import { paginationTokens } from './paginationRange';

describe('paginationTokens', () => {
  it('shows the first three and last two pages', () => {
    expect(paginationTokens(1, 34)).toEqual([1, 2, 3, 'ellipsis-left', 33, 34]);
  });

  it('adds the current page neighbourhood in the middle', () => {
    expect(paginationTokens(17, 34)).toEqual([1, 2, 3, 'ellipsis-left', 16, 17, 18, 'ellipsis-right', 33, 34]);
  });

  it('does not add ellipses when all pages are adjacent', () => {
    expect(paginationTokens(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
