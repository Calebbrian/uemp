import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { SheetDetail } from '../../lib/types';
import { Banner, Button, Card, cx, Spinner, StatusBadge } from '../../components/ui/primitives';
import { ConfirmDialog } from '../../components/ui/overlay';
import { useToast } from '../../components/ui/toast';
import { SheetHistory, SheetStatusBanner, SheetSummary } from '../../components/results';
import { useAdminScope } from '../../components/shared';

type Action = 'approve' | 'reject' | 'reopen';

const th = 'border-b border-line bg-subtle px-3.5 py-2.5 text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';
const td = 'border-b border-line-soft px-3.5 py-[11px] whitespace-nowrap';

export function ResultReviewPage() {
  const { offeringId } = useParams();
  const { base, isSuper } = useAdminScope();
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['results', 'sheet', offeringId];
  const query = useQuery({ queryKey, queryFn: () => api.get<SheetDetail>(`/results/sheets/${offeringId}`) });
  const [action, setAction] = useState<Action | null>(null);

  const review = useMutation({
    mutationFn: ({ kind, comment }: { kind: Action; comment: string }) => api.post<SheetDetail>(`/results/sheets/${offeringId}/${kind}`, { comment: comment || null }),
    onSuccess: (_sheet, { kind }) => {
      setAction(null);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['results', 'sheets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const code = query.data?.offering.course.code;
      if (kind === 'approve') toast.success(`${code} approved`, 'Results are now visible to students.');
      if (kind === 'reject') toast.success(`${code} returned to the lecturer`, 'They will see your feedback and can resubmit.');
      if (kind === 'reopen') toast.success(`${code} reopened`, 'Results are hidden from students until approved again.');
    },
    onError: (err) => toast.error('Action failed', err.message),
  });

  if (query.isPending) return <Spinner label="Loading result sheet" />;
  if (query.error) return <Banner kind="error" title="We couldn’t open this result sheet.">{query.error.message}</Banner>;

  const { offering, sheet, students, summary, history, actions } = query.data;
  const code = offering.course.code;
  const dialog = action && {
    approve: {
      title: `Approve ${code} results?`,
      message: `Grades become final and visible to all ${students.length} students immediately.`,
      label: 'Comment',
      required: false,
      placeholder: 'e.g. Checked against the exam scripts',
      confirm: 'Approve results',
      danger: false,
    },
    reject: {
      title: `Reject ${code} results`,
      message: `The sheet goes back to ${offering.lecturers.map((l) => l.name).join(', ') || 'the lecturer'} for correction. Scores unlock for editing.`,
      label: 'Feedback for the lecturer',
      required: true,
      placeholder: 'e.g. CA scores for rows 4–6 look swapped with exam',
      confirm: 'Reject and return',
      danger: true,
    },
    reopen: {
      title: `Reopen ${code}?`,
      message: 'Results will be hidden from students and the sheet returns to the lecturer for correction.',
      label: 'Reason',
      required: true,
      placeholder: 'e.g. Student appeal on script 014 upheld',
      confirm: 'Reopen sheet',
      danger: true,
    },
  }[action];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link to={`${base}/results`} className="inline-flex items-center gap-1 text-[13px] text-muted! no-underline hover:text-ink!">
            <ArrowLeft className="size-3.5" aria-hidden /> {isSuper ? 'Result Approvals' : 'Results Approval'}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-2xl font-semibold">
              {code} · {offering.course.title}
            </h1>
            <StatusBadge status={sheet.status} />
          </div>
          <span className="text-sm text-muted">
            {offering.semester.label} · {offering.course.units} units · {offering.course.department.name} · Lecturer: {offering.lecturers.map((l) => l.name).join(', ') || '—'}
            {sheet.submittedAt && ` · Submitted by ${sheet.submittedBy} on ${formatDateTime(sheet.submittedAt)}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {actions?.canReject && (
            <Button variant="secondary" className="border-[#E3A59E]! text-danger-ink! hover:bg-[#FFF5F4]!" onClick={() => setAction('reject')}>
              Reject
            </Button>
          )}
          {actions?.canApprove && <Button onClick={() => setAction('approve')}>Approve results</Button>}
          {actions?.canReopen && (
            <Button variant="secondary" onClick={() => setAction('reopen')}>
              Reopen sheet
            </Button>
          )}
        </div>
      </div>

      {isSuper && (
        <div role="note" className="flex gap-2.5 rounded-lg border border-info-line bg-info-bg px-3.5 py-3 text-sm text-info-fg">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            You’re viewing as Super Admin. Only the {offering.course.department.name} department admin can approve or reject this sheet; you can reopen approved sheets.
          </span>
        </div>
      )}
      <SheetStatusBanner sheet={sheet} audience="reviewer" />

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[999_1_600px] overflow-hidden" aria-label="Scores (read-only)">
          <div className="flex flex-wrap justify-between gap-3 border-b border-line px-3.5 py-3">
            <span className="text-sm font-semibold">Scores · read-only</span>
            <span className="num text-[13px] text-muted">{students.length} students</span>
          </div>
          {students.length === 0 ? (
            <p className="m-0 px-4 py-6 text-sm text-muted">No students are registered for this course.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cx(th, 'text-right')}>#</th>
                    <th className={cx(th, 'text-left')}>Matric no.</th>
                    <th className={cx(th, 'text-left')}>Student</th>
                    <th className={cx(th, 'text-right')}>CA /{query.data.limits.caMax}</th>
                    <th className={cx(th, 'text-right')}>Exam /{query.data.limits.examMax}</th>
                    <th className={cx(th, 'text-right')}>Total</th>
                    <th className={cx(th, 'text-left')}>Grade</th>
                    <th className={cx(th, 'text-right')}>Point</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.enrollmentId} className="num">
                      <td className={cx(td, 'text-right text-muted')}>{i + 1}</td>
                      <td className={td}>{s.matricNo}</td>
                      <td className={td}>{s.name}</td>
                      <td className={cx(td, 'text-right')}>{s.caScore ?? '—'}</td>
                      <td className={cx(td, 'text-right')}>{s.examScore ?? '—'}</td>
                      <td className={cx(td, 'text-right font-semibold')}>{s.totalScore ?? '—'}</td>
                      <td className={cx(td, 'font-bold', s.gradePoint === 0 && 'text-danger-ink')}>{s.grade ?? '—'}</td>
                      <td className={cx(td, 'text-right')}>{s.gradePoint ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="flex flex-[1_1_300px] flex-col gap-5">
          <SheetSummary summary={summary} />
        </div>
      </div>

      <SheetHistory history={history} />

      {dialog && (
        <ConfirmDialog
          open={!!action}
          onClose={() => setAction(null)}
          onConfirm={(comment) => review.mutate({ kind: action!, comment })}
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirm}
          danger={dialog.danger}
          loading={review.isPending}
          comment={{
            label: dialog.label,
            required: dialog.required,
            placeholder: dialog.placeholder,
            requiredMessage: 'A comment is required so the lecturer knows what to change.',
          }}
        />
      )}
    </>
  );
}
