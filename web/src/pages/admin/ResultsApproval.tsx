import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { SquareCheckBig } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { DeptRef, ResultStatus, Semester } from '../../lib/types';
import { ButtonLink, cx, EmptyState, PageHeader, StatusBadge } from '../../components/ui/primitives';
import { SearchInput } from '../../components/ui/form';
import { DataTable } from '../../components/ui/table';
import { DepartmentFilter, SemesterSelect, useAdminScope } from '../../components/shared';

type SheetRow = {
  offeringId: string;
  code: string;
  title: string;
  units: number;
  department: DeptRef;
  lecturers: string[];
  students: number;
  status: ResultStatus;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

const TABS: { status: ResultStatus | ''; label: string }[] = [
  { status: 'SUBMITTED', label: 'Pending' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: 'DRAFT', label: 'Draft' },
  { status: '', label: 'All' },
];

export function ResultsApprovalPage() {
  const { base, isSuper } = useAdminScope();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ResultStatus | ''>('SUBMITTED');
  const [semesterId, setSemesterId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [q, setQ] = useState('');

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['results', 'sheets', { status, semesterId, departmentId, q }],
    queryFn: () =>
      api.get<{ semester: Semester | null; items: SheetRow[]; counts: Record<ResultStatus, number> }>('/results/sheets', {
        status,
        semesterId,
        departmentId,
        q,
      }),
    placeholderData: (prev) => prev,
  });

  const counts = data?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader
        title={isSuper ? 'Result Approvals' : 'Results Approval'}
        description={
          isSuper
            ? 'University-wide oversight of result sheets. Approval is done by each department’s admin.'
            : 'Review result sheets submitted by lecturers, then approve them or return them with feedback.'
        }
      />

      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = status === t.status;
          const n = t.status ? counts?.[t.status] : total;
          return (
            <button
              key={t.label}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setStatus(t.status)}
              className={cx(
                '-mb-px flex h-10 cursor-pointer items-center gap-2 border-b-2 bg-transparent px-3 text-sm',
                active ? 'border-brand font-semibold text-brand' : 'border-transparent font-medium text-ink-2 hover:text-ink',
              )}
            >
              {t.label}
              {n !== undefined && (
                <span className={cx('num rounded-full px-2 text-xs font-semibold', active ? 'bg-brand-50' : 'bg-surface text-muted', t.status === 'SUBMITTED' && n ? 'bg-sub-bg text-sub-fg' : '')}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <DataTable
        caption="Result sheets"
        toolbar={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search course code or title" label="Search result sheets" />
            <SemesterSelect value={semesterId} onChange={setSemesterId} />
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
          </>
        }
        rows={data?.items}
        loading={isPending}
        error={error}
        onRetry={refetch}
        rowKey={(r) => r.offeringId}
        onRowClick={(r) => navigate(`${base}/results/${r.offeringId}`)}
        empty={
          <EmptyState
            icon={SquareCheckBig}
            message={status === 'SUBMITTED' ? 'No result sheets are waiting for approval.' : 'No result sheets match these filters.'}
          />
        }
        columns={[
          {
            key: 'course',
            header: 'Course',
            sortValue: (r) => r.code,
            render: (r) => (
              <div>
                <strong>{r.code}</strong>
                <div className="text-[13px] text-muted">{r.title}</div>
              </div>
            ),
          },
          ...(isSuper ? [{ key: 'dept', header: 'Department', render: (r: SheetRow) => r.department.name, sortValue: (r: SheetRow) => r.department.name }] : []),
          { key: 'lecturers', header: 'Lecturer', render: (r) => r.lecturers.join(', ') || '—' },
          { key: 'students', header: 'Students', align: 'right', render: (r) => <span className="num">{r.students}</span> },
          {
            key: 'submitted',
            header: 'Submitted',
            sortValue: (r) => r.submittedAt ?? '',
            render: (r) => (r.submittedAt ? <span className="num text-ink-2">{formatDateTime(r.submittedAt)}</span> : <span className="text-muted">—</span>),
          },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'action',
            header: <span className="sr-only">Action</span>,
            align: 'right',
            render: (r) => (
              <span onClick={(e) => e.stopPropagation()}>
                <ButtonLink to={`${base}/results/${r.offeringId}`} size="sm" variant={r.status === 'SUBMITTED' && !isSuper ? 'primary' : 'secondary'}>
                  {r.status === 'SUBMITTED' && !isSuper ? 'Review' : 'View'}
                </ButtonLink>
              </span>
            ),
          },
        ]}
      />
      {!isSuper && (
        <p className="m-0 text-[13px] text-muted">
          Courses owned by other departments (for example MTH courses taken by your students) are approved by that department’s admin.
        </p>
      )}
    </>
  );
}
