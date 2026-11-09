import { useState, type ReactNode } from 'react';
import { ChevronUp, ChevronsUpDown, Search, TriangleAlert } from 'lucide-react';
import { Button, cx, EmptyState, Skeleton } from './primitives';

export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'right' | 'center';
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  caption?: string;
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
};

const alignCls = { left: 'text-left', right: 'text-right', center: 'text-center' };

/** Table with toolbar, loading skeleton, empty and error states, and optional client-side sorting. */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, toolbar, footer, caption, rowClassName, onRowClick }: TableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  let sorted = rows ?? [];
  const sortCol = sort && columns.find((c) => c.key === sort.key);
  if (sortCol?.sortValue) {
    sorted = [...sorted].sort((a, b) => {
      const av = sortCol.sortValue!(a) ?? '';
      const bv = sortCol.sortValue!(b) ?? '';
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort!.dir;
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      {toolbar && <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3.5">{toolbar}</div>}
      {error ? (
        <div role="alert">
          <EmptyState
            icon={TriangleAlert}
            tone="danger"
            message={error instanceof Error ? error.message : 'We couldn’t load this list.'}
            action={onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
          />
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-busy={loading || undefined}>
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr>
                {columns.map((col) => {
                  const active = sort?.key === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                      className={cx(
                        'border-b border-line bg-subtle px-4 py-2.5 text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase',
                        alignCls[col.align ?? 'left'],
                        col.headerClassName,
                      )}
                    >
                      {col.sortValue ? (
                        <button
                          type="button"
                          className="inline-flex cursor-pointer items-center gap-1 uppercase"
                          onClick={() => setSort(active ? { key: col.key, dir: sort!.dir === 1 ? -1 : 1 } : { key: col.key, dir: 1 })}
                        >
                          {col.header}
                          {active ? (
                            <ChevronUp className={cx('size-3', sort!.dir === -1 && 'rotate-180')} strokeWidth={2.5} aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3 text-faint" strokeWidth={2.5} aria-hidden />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      {columns.map((col, j) => (
                        <td key={col.key} className="border-b border-line-soft px-4 py-3.5">
                          <Skeleton className="h-3" />
                          <span className="sr-only">{i === 0 && j === 0 ? 'Loading' : ''}</span>
                        </td>
                      ))}
                    </tr>
                  ))
                : sorted.map((row) => (
                    <tr
                      key={rowKey(row)}
                      className={cx('hover:[&>td]:bg-hover', onRowClick && 'cursor-pointer', rowClassName?.(row))}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className={cx('border-b border-line-soft px-4 py-3 align-middle whitespace-nowrap text-ink', alignCls[col.align ?? 'left'], col.className)}>
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
          {!loading && sorted.length === 0 && (empty ?? <EmptyState icon={Search} tone="muted" message="Nothing to show yet." />)}
        </div>
      )}
      {footer}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, noun = 'records' }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const numbers: (number | '…')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) numbers.push(p);
    else if (numbers[numbers.length - 1] !== '…') numbers.push('…');
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] text-muted">
      <span className="num">
        Showing {from}–{to} of {total} {noun}
      </span>
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          {numbers.map((n, i) =>
            n === '…' ? (
              <span key={`gap-${i}`}>…</span>
            ) : (
              <button
                key={n}
                type="button"
                aria-current={n === page ? 'page' : undefined}
                onClick={() => onPage(n)}
                className={cx('num h-8 min-w-8 cursor-pointer rounded-lg px-2 text-[13px] font-semibold', n === page ? 'bg-brand-50 text-brand' : 'text-ink hover:bg-[#EEF1EF]')}
              >
                {n}
              </button>
            ),
          )}
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
