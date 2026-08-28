export interface Page<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface PageRequest {
  page?: number;
  perPage?: number;
}

export const DEFAULT_PER_PAGE = 20;
export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
