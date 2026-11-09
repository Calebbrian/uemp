import type { ReactNode } from 'react';
import type { ScoreSummary } from '../../lib/types';

/** Horizontal bars, labelled with text so the values never depend on colour alone. */
export function BarList({ items, emptyText = 'No data yet.' }: { items: { label: ReactNode; value: number; sub?: ReactNode }[]; emptyText?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="m-0 text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[minmax(80px,140px)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-ink-2">{item.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
            <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="num min-w-8 text-right font-semibold">
            {item.value}
            {item.sub}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Grade distribution as vertical bars (A..F). */
export function GradeDistribution({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <div className="flex h-[120px] items-end gap-2" role="img" aria-label={entries.map(([g, n]) => `${g}: ${n}`).join(', ')}>
      {entries.map(([grade, n]) => (
        <div key={grade} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="num text-xs font-semibold text-ink-2">{n}</span>
          <span
            className={grade === 'F' ? 'w-full rounded-t bg-[#E8A29B]' : 'w-full rounded-t bg-brand-600'}
            style={{ height: `${Math.max(4, (n / max) * 72)}px`, opacity: grade === 'F' ? 1 : 0.55 + (n / max) * 0.45 }}
          />
          <span className="text-xs font-semibold text-muted">{grade}</span>
        </div>
      ))}
    </div>
  );
}

export function ScoreSummaryPanel({ summary }: { summary: ScoreSummary }) {
  const stats = [
    { label: 'Average', value: summary.average?.toFixed(1) ?? '—' },
    { label: 'Highest', value: summary.highest ?? '—' },
    { label: 'Lowest', value: summary.lowest ?? '—' },
    { label: 'Pass rate', value: summary.passRate === null ? '—' : `${Math.round(summary.passRate)}%` },
  ];
  return (
    <div className="flex flex-col gap-5">
      <dl className="m-0 grid grid-cols-2 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <dt className="text-[13px] text-muted">{s.label}</dt>
            <dd className="num m-0 text-xl font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <span className="cap">Grade distribution</span>
        <GradeDistribution distribution={summary.distribution} />
      </div>
      <p className="m-0 text-[13px] text-muted num">
        {summary.graded} of {summary.students} students fully scored
      </p>
    </div>
  );
}
