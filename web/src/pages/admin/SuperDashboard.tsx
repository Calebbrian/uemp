import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { ResultStatus, Semester } from '../../lib/types';
import { Badge, Banner, ButtonLink, Card, cx, RegistrationBadge, Skeleton, StatCard } from '../../components/ui/primitives';
import { BarList } from '../../components/ui/charts';
import { ActivityFeed, STATUS_ROWS, type ActivityItem } from './DeptDashboard';

type UniversityDashboard = {
  semester: Semester | null;
  stats: { faculties: number; departments: number; programs: number; students: number; lecturers: number; courses: number; registrations: number };
  resultsByDepartment: ({ id: string; code: string; name: string; registrations: number } & Record<ResultStatus, number>)[];
  registrationsByFaculty: { id: string; code: string; name: string; registrations: number }[];
  activity: ActivityItem[];
};

type SessionRow = { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean };

export function SuperDashboardPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['dashboard', 'university'], queryFn: () => api.get<UniversityDashboard>('/dashboard/university') });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<{ items: SessionRow[] }>('/sessions') });
  const currentSession = sessions.data?.items.find((s) => s.isCurrent);

  if (error) return <Banner kind="error" title="We couldn’t load the dashboard.">{error.message}</Banner>;
  const s = data?.stats;
  const totals = data
    ? STATUS_ROWS.map((r) => ({ ...r, n: data.resultsByDepartment.reduce((sum, d) => sum + d[r.status], 0) }))
    : [];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">University overview</h1>
        <p className="m-0 text-sm text-muted">All faculties and departments · {data?.semester?.label ?? '…'}</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-3">
        <StatCard label="Faculties" loading={isPending} value={s?.faculties} to="/admin/faculties" />
        <StatCard label="Departments" loading={isPending} value={s?.departments} to="/admin/departments" />
        <StatCard label="Programmes" loading={isPending} value={s?.programs} to="/admin/programmes" />
        <StatCard label="Students" loading={isPending} value={s?.students.toLocaleString('en-GB')} sub="Active accounts" to="/admin/users?role=STUDENT" />
        <StatCard label="Lecturers" loading={isPending} value={s?.lecturers} sub="Active accounts" to="/admin/users?role=LECTURER" />
        <StatCard label="Courses" loading={isPending} value={s?.courses} to="/admin/courses" />
        <StatCard label="Registrations" loading={isPending} value={s?.registrations.toLocaleString('en-GB')} to="/admin/registrations" />
      </div>

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
        <div className="flex flex-[1_1_280px] flex-col gap-1">
          <span className="text-[13px] font-medium text-muted">Current period</span>
          <h2 className="m-0 text-lg font-semibold">{data?.semester?.label ?? (isPending ? <Skeleton className="h-5 w-56" /> : 'No current semester set')}</h2>
          {currentSession && (
            <span className="text-[13px] text-muted">
              Session runs {formatDate(currentSession.startDate)} – {formatDate(currentSession.endDate)}
            </span>
          )}
        </div>
        {data?.semester && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">Registration</span>
            <RegistrationBadge open={data.semester.registrationOpen} />
          </div>
        )}
        <ButtonLink to="/admin/sessions" variant="secondary">
          Manage sessions
        </ButtonLink>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-start gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="m-0 text-base font-semibold">Result approvals by department</h2>
            <Link to="/admin/results" className="text-sm font-semibold">
              Oversight view
            </Link>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line [&>th]:bg-subtle [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-[0.04em] [&>th]:whitespace-nowrap [&>th]:text-[#555F5A] [&>th]:uppercase">
                  <th className="text-left">Department</th>
                  {STATUS_ROWS.map((r) => (
                    <th key={r.status} className="text-right">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.resultsByDepartment.map((d) => (
                  <tr key={d.id} className="num [&>td]:border-b [&>td]:border-line-soft [&>td]:px-3 [&>td]:py-3 [&>td]:whitespace-nowrap">
                    <td className="whitespace-normal!">
                      <strong>{d.name}</strong>
                      <div className="text-xs text-muted">{d.code}</div>
                    </td>
                    <td className="text-right">{d.DRAFT}</td>
                    <td className={cx('text-right', d.SUBMITTED ? 'font-bold text-sub-fg' : '')}>{d.SUBMITTED}</td>
                    <td className="text-right">{d.APPROVED}</td>
                    <td className={cx('text-right', d.REJECTED ? 'text-danger-ink' : '')}>{d.REJECTED}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <div className="flex flex-wrap gap-3.5 bg-subtle px-4 py-3">
              {totals.map((t) => (
                <Badge key={t.status} tone={t.tone}>
                  {t.label} {t.n}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3.5 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-base font-semibold">Registrations by faculty</h2>
            <span className="num text-[13px] text-muted">{s?.registrations.toLocaleString('en-GB')} total</span>
          </div>
          <BarList items={(data?.registrationsByFaculty ?? []).map((f) => ({ label: f.name.replace(/^Faculty of /, ''), value: f.registrations }))} emptyText="No registrations yet." />
        </Card>
      </div>

      <ActivityFeed items={data?.activity} link="/admin/audit" loading={isPending} />
    </>
  );
}
