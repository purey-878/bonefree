export type PaginationToken = number | 'ellipsis-left' | 'ellipsis-right';

export function paginationTokens(page: number, totalPages: number): PaginationToken[] {
  if (totalPages <= 0) return [];
  const pages = new Set<number>();
  for (let value = 1; value <= Math.min(3, totalPages); value += 1) pages.add(value);
  for (let value = Math.max(1, totalPages - 1); value <= totalPages; value += 1) pages.add(value);
  for (let value = Math.max(1, page - 1); value <= Math.min(totalPages, page + 1); value += 1) pages.add(value);
  const sorted = [...pages].sort((a, b) => a - b);
  const tokens: PaginationToken[] = [];
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous && value - previous > 1) tokens.push(previous <= 3 ? 'ellipsis-left' : 'ellipsis-right');
    tokens.push(value);
  });
  return tokens;
}
