import { useId, useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PER_PAGE_OPTIONS } from '../../types/pagination';
import { paginationTokens } from './paginationRange';
import './Pagination.css';

interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  variant?: 'storefront' | 'admin';
  className?: string;
}

export function Pagination({ page, perPage, total, totalPages, onPageChange, onPerPageChange, variant = 'storefront', className = '' }: PaginationProps) {
  const { t } = useTranslation('common');
  const pageInputId = useId();
  const [targetPageDraft, setTargetPageDraft] = useState<string | null>(null);
  const targetPage = targetPageDraft ?? String(page);
  const tokens = useMemo(() => paginationTokens(page, totalPages), [page, totalPages]);
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);
  if (total === 0) return null;

  const rangeLabel = first === last
    ? t('pagination.singleRange', { count: last, total })
    : t('pagination.range', { first, last, total });

  if (totalPages <= 1) {
    return (
      <div className={`pagination pagination--${variant} pagination--single ${className}`.trim()}>
        <span>{rangeLabel}</span>
      </div>
    );
  }

  const go = (value: number) => {
    setTargetPageDraft(null);
    onPageChange(Math.min(Math.max(1, value), Math.max(1, totalPages)));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number.parseInt(targetPage, 10);
    const next = Number.isFinite(parsed) ? Math.min(Math.max(1, parsed), Math.max(1, totalPages)) : page;
    setTargetPageDraft(null);
    go(next);
  };

  return (
    <nav className={`pagination pagination--${variant} ${className}`.trim()} aria-label={t('pagination.navigation')}>
      <div className="pagination__summary">
        <span>{rangeLabel}</span>
        <label><span>{t('pagination.perPage')}</span><select value={perPage} onChange={(event) => { setTargetPageDraft(null); onPerPageChange(Number(event.target.value)); }} aria-label={t('pagination.perPage')}>
          {PER_PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select></label>
      </div>
      <div className="pagination__pages">
        <button type="button" className="pagination__arrow" onClick={() => go(page - 1)} disabled={page <= 1} aria-label={t('pagination.previous')}><ChevronLeft aria-hidden="true" size={17} /></button>
        {tokens.map((token) => token === 'ellipsis-left' || token === 'ellipsis-right' ? <span className="pagination__ellipsis" aria-hidden="true" key={token}>…</span> : (
          <button type="button" key={token} className={`pagination__number${token === page ? ' is-active' : ''}`} aria-current={token === page ? 'page' : undefined} aria-label={t('pagination.page', { page: token })} onClick={() => go(token)}>{token}</button>
        ))}
        <button type="button" className="pagination__arrow" onClick={() => go(page + 1)} disabled={page >= totalPages} aria-label={t('pagination.next')}><ChevronRight aria-hidden="true" size={17} /></button>
      </div>
      <form className="pagination__jump" onSubmit={submit}>
        <label htmlFor={pageInputId}>{t('pagination.goTo')}</label>
        <input id={pageInputId} inputMode="numeric" min={1} max={Math.max(1, totalPages)} type="number" value={targetPage} onChange={(event) => setTargetPageDraft(event.target.value)} />
        <button type="submit">{t('pagination.go')}</button>
      </form>
    </nav>
  );
}
