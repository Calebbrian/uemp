import { CircleCheck, CircleX, Info, Lock, SquareCheckBig, type LucideIcon } from 'lucide-react';
import { formatDateTime, ROLE_LABEL } from '../lib/format';
import type { HistoryEntry, ResultStatus, ScoreSummary, SheetDetail } from '../lib/types';
import { Card, cx } from './ui/primitives';

const BANNER: Record<ResultStatus, { cls: string; icon: LucideIcon }> = {
  DRAFT: { cls: 'bg-info-bg border-info-line text-info-fg', icon: Info },
  REJECTED: { cls: 'bg-danger-50 border-danger-line text-[#7F1A13]', icon: CircleX },
  SUBMITTED: { cls: 'bg-sub-bg border-[#EBCB85] text-[#5C3900]', icon: Lock },
  APPROVED: { cls: 'bg-ok-bg border-[#A9D8BB] text-[#0B4526]', icon: SquareCheckBig },
};

/** Status banner for a result sheet, worded for the lecturer or the reviewer. */
export function SheetStatusBanner({ sheet, audience }: { sheet: SheetDetail['sheet']; audience: 'lecturer' | 'reviewer' }) {
  const b = BANNER[sheet.status];
  let head: string;
  let body: React.ReactNode;
  switch (sheet.status) {
    case 'DRAFT':
      head = audience === 'lecturer' ? 'Enter scores and save as draft.' : 'Not submitted yet.';
      body =
        audience === 'lecturer'
          ? 'Submit when every student has both a CA and an exam score.'
          : 'The lecturer is still entering scores. You can review the sheet once it is submitted.';
      break;
    case 'REJECTED':
      head = `Returned by ${sheet.reviewedBy ?? 'the department'} on ${formatDateTime(sheet.reviewedAt)}`;
      body = (
        <>
          {sheet.reviewComment && <>“{sheet.reviewComment}” </>}
          {audience === 'lecturer' ? 'Correct the scores, then resubmit.' : 'Waiting for the lecturer to correct and resubmit.'}
        </>
      );
      break;
    case 'SUBMITTED':
      head = `Submitted by ${sheet.submittedBy ?? 'the lecturer'} on ${formatDateTime(sheet.submittedAt)} and awaiting department approval.`;
      body = audience === 'lecturer' ? 'Scores are locked while the department reviews them.' : 'Check the scores below, then approve or reject with feedback.';
      break;
    case 'APPROVED':
      head = `Approved by ${sheet.reviewedBy ?? 'the department'} on ${formatDateTime(sheet.reviewedAt)}.`;
      body = (
        <>
          {sheet.reviewComment && <>“{sheet.reviewComment}” </>}
          Results are visible to students.{audience === 'lecturer' ? ' Only the department can reopen this sheet.' : ''}
        </>
      );
      break;
  }
  const IconCmp = b.icon;
  return (
    <div role="status" className={cx('flex gap-3 rounded-lg border px-4 py-3.5 text-sm leading-[21px]', b.cls)}>
      <IconCmp className="mt-[3px] size-4 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1">
        <strong>{head}</strong>
        <span>{body}</span>
      </div>
    </div>
  );
}

/** Summary card used on the score sheet and the review page. */
export function SheetSummary({ summary }: { summary: ScoreSummary }) {
  const max = Math.max(1, ...Object.values(summary.distribution));
  const stats = [
    ['Average', summary.average === null ? '—' : summary.average.toFixed(1)],
    ['Pass rate', summary.passRate === null ? '—' : `${Math.round(summary.passRate)}%`],
    ['Highest', summary.highest ?? '—'],
    ['Lowest', summary.lowest ?? '—'],
  ];
  return (
    <Card className="flex flex-col gap-[18px] p-5" aria-label="Summary">
      <h2 className="m-0 text-base font-semibold">Summary</h2>
      <dl className="m-0 grid grid-cols-2 gap-3.5">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-muted">{k}</dt>
            <dd className="num m-0 text-[22px] font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">Grade distribution</span>
        {Object.entries(summary.distribution).map(([grade, n]) => (
          <div key={grade} className="num flex items-center gap-2.5 text-[13px]">
            <span className="w-3.5 font-bold">{grade}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#EEF1EF]" aria-hidden>
              <span className={cx('block h-full', grade === 'F' ? 'bg-danger' : 'bg-brand-600')} style={{ width: `${(n / max) * 100}%` }} />
            </span>
            <span className="w-5 text-right">{n}</span>
          </div>
        ))}
        <span className="text-xs text-muted">
          Based on {summary.graded} of {summary.students} fully scored students. Pass = grade point above 0.
        </span>
      </div>
    </Card>
  );
}

const HISTORY_ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  RESULT_APPROVED: { icon: CircleCheck, cls: 'bg-ok-bg text-ok-fg' },
  RESULT_REJECTED: { icon: CircleX, cls: 'bg-danger-50 text-danger-ink' },
  RESULT_REOPENED: { icon: CircleX, cls: 'bg-danger-50 text-danger-ink' },
  RESULT_SUBMITTED: { icon: Lock, cls: 'bg-sub-bg text-sub-fg' },
};

type ScoreChange = { matricNo: string; before: { ca: number | null; exam: number | null }; after: { ca: number | null; exam: number | null } };

function changesOf(entry: HistoryEntry): ScoreChange[] {
  const meta = entry.metadata as { changes?: ScoreChange[] } | null;
  return Array.isArray(meta?.changes) ? meta.changes : [];
}

const show = (v: number | null) => (v === null ? '—' : v);

/** Audit trail for one sheet, newest first. */
export function SheetHistory({ history }: { history: HistoryEntry[] }) {
  return (
    <Card className="overflow-hidden">
      <h2 className="m-0 border-b border-line px-5 py-4 text-base font-semibold">History</h2>
      {history.length === 0 ? (
        <p className="m-0 px-5 py-5 text-sm text-muted">No activity recorded yet.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {history.map((h) => {
            const style = HISTORY_ICON[h.action] ?? { icon: Info, cls: 'bg-surface text-muted' };
            const IconCmp = style.icon;
            const changes = changesOf(h);
            return (
              <li key={h.id} className="flex gap-3 border-b border-line-soft px-5 py-3.5 last:border-b-0">
                <span className={cx('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', style.cls)}>
                  <IconCmp className="size-3.5" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <strong className="text-sm">{h.label}</strong>
                    <time className="num text-xs text-muted" dateTime={h.createdAt}>
                      {formatDateTime(h.createdAt)}
                    </time>
                  </div>
                  <span className="text-[13px] text-ink-2">{h.summary}</span>
                  <span className="text-xs text-muted">
                    {h.actor ?? 'System'}
                    {h.actorRole ? ` · ${ROLE_LABEL[h.actorRole]}` : ''}
                  </span>
                  {changes.length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer font-semibold text-brand">Show {changes.length} score change{changes.length === 1 ? '' : 's'}</summary>
                      <ul className="num m-0 mt-2 flex list-none flex-col gap-1 p-0 text-ink-2">
                        {changes.map((c, i) => (
                          <li key={i}>
                            <span className="font-medium">{c.matricNo}</span>:{' '}
                            {[
                              c.before.ca !== c.after.ca && `CA ${show(c.before.ca)} → ${show(c.after.ca)}`,
                              c.before.exam !== c.after.exam && `Exam ${show(c.before.exam)} → ${show(c.after.exam)}`,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
