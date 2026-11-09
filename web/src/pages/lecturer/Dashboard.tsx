import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import type { Semester } from '../../lib/types';
import { Banner, ButtonLink, Card, EmptyState, Skeleton, StatCard, StatusBadge } from '../../components/ui/primitives';
import { BookOpen } from 'lucide-react';

export type LecturerCourse = {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  department: string;
  students: number;
  graded: number;
  coLecturers: string[];
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
};

type Dashboard = {
  semester: Semester | null;
  stats: { courses: number; students: number; pendingSubmission: number; returned: number };
  needsAttention: LecturerCourse[];
  courses: LecturerCourse[];
};

export function LecturerDashboardPage() {
  const user = useUser();
  const { data, isPending, error } = useQuery({ queryKey: ['lecturer', 'dashboard'], queryFn: () => api.get<Dashboard>('/lecturer/dashboard') });

  if (error) return <Banner kind="error" title="We couldn’t load your dashboard.">{error.message}</Banner>;
  const rejected = data?.needsAttention.filter((c) => c.status === 'REJECTED') ?? [];
  const drafts = data?.needsAttention.filter((c) => c.status === 'DRAFT') ?? [];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">Welcome back, {[user.title, user.lastName].filter(Boolean).join(' ')}</h1>
        <p className="m-0 text-sm text-muted">
          {user.department?.name} · {data?.semester?.label ?? '…'}
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        <StatCard label="Courses assigned" loading={isPending} value={data?.stats.courses} sub="This semester" />
        <StatCard label="Students taught" loading={isPending} value={data?.stats.students} sub={`Registrations across ${data?.stats.courses ?? 0} courses`} />
        <StatCard label="Sheets pending submission" loading={isPending} value={data?.stats.pendingSubmission} sub={drafts.length ? `${drafts.map((d) => d.code).join(', ')} in draft` : 'Nothing waiting'} />
        {data && data.stats.returned > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-danger-line bg-[#FFF7F6] p-5">
            <span className="text-[13px] font-semibold text-danger-ink">Returned for correction</span>
            <span className="num text-[30px] leading-9 font-bold text-[#7F1A13]">{data.stats.returned}</span>
            <span className="text-[13px] text-[#7F1A13]">{rejected.map((r) => r.code).join(', ')} rejected</span>
          </div>
        ) : (
          <StatCard label="Returned for correction" loading={isPending} value={0} sub="No sheets returned" />
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-start gap-4">
        <Card className="overflow-hidden">
          <h2 className="m-0 border-b border-line px-5 py-4 text-base font-semibold">Needs attention</h2>
          {isPending ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : rejected.length + drafts.length === 0 ? (
            <p className="m-0 px-5 py-6 text-sm text-muted">You’re all caught up. Every sheet has been submitted.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {[...rejected, ...drafts].map((c) => (
                <li key={c.id} className="flex flex-col gap-2.5 border-b border-line-soft px-5 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <strong className="text-sm">
                      {c.code} · {c.title}
                    </strong>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.status === 'REJECTED' ? (
                    <blockquote className="m-0 rounded-md bg-[#FBF4F3] px-3 py-2.5 text-sm leading-5 text-ink-2">
                      {c.reviewComment ? `“${c.reviewComment}”` : 'Returned for correction.'}
                      <span className="mt-1 block text-xs text-muted">
                        {c.reviewedBy} · {formatDateTime(c.reviewedAt)}
                      </span>
                    </blockquote>
                  ) : (
                    <span className="num text-sm text-ink-2">
                      {c.graded} of {c.students} students scored{c.updatedAt ? ` · last saved ${formatDateTime(c.updatedAt)}` : ''}
                    </span>
                  )}
                  <div>
                    <ButtonLink to={`/lecturer/courses/${c.id}`} size="sm" variant={c.status === 'REJECTED' ? 'primary' : 'secondary'}>
                      {c.status === 'REJECTED' ? 'Fix and resubmit' : c.graded ? 'Continue entering scores' : 'Start entering scores'}
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="m-0 text-base font-semibold">My courses this semester</h2>
            <Link to="/lecturer/courses" className="text-sm font-semibold">
              All courses
            </Link>
          </div>
          {data && data.courses.length === 0 ? (
            <EmptyState icon={BookOpen} message="You haven’t been assigned any courses this semester." />
          ) : (
            <ul className="m-0 list-none p-0">
              {data?.courses.map((c) => (
                <li key={c.id} className="flex items-center gap-3 border-b border-line-soft px-5 py-3.5 last:border-b-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="truncate text-sm">
                      {c.code} · {c.title}
                    </strong>
                    <span className="num text-[13px] text-muted">
                      {c.units} units · {c.students} students{c.coLecturers.length ? ` · with ${c.coLecturers.join(', ')}` : ''}
                    </span>
                  </div>
                  <StatusBadge status={c.status} />
                  <Link to={`/lecturer/courses/${c.id}`} className="text-[13px] font-semibold whitespace-nowrap">
                    Open sheet
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
