import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { ResultStatus, Role, Semester } from '../../lib/types';
import { Badge, Banner, ButtonLink, Card, Skeleton, StatCard, type Tone } from '../../components/ui/primitives';
import { BarList } from '../../components/ui/charts';

export type ActivityItem = { id: string; action: string; label: string; summary: string; actor: string; actorRole: Role | null; createdAt: string };

type DeptDashboard = {
  department: { id: string; code: string; name: string; faculty: string } | null;
  semester: Semester | null;
  stats: { students: number; lecturers: number; courses: number; offerings: number; registrations: number; pendingApproval: number };
  resultCounts: Record<ResultStatus, number>;
  pending: { offeringId: string; code: string; title: string; students: number; lecturers: string[]; submittedBy: string | null; submittedAt: string | null }[];
  studentsByLevel: { level: number; count: number }[];
  activity: ActivityItem[];
};

export const STATUS_ROWS: { status: ResultStatus; label: string; tone: Tone; bar: string }[] = [
  { status: 'DRAFT', label: 'Draft', tone: 'draft', bar: 'bg-faint' },
  { status: 'SUBMITTED', label: 'Submitted', tone: 'sub', bar: 'bg-[#C77700]' },
  { status: 'APPROVED', label: 'Approved', tone: 'ok', bar: 'bg-brand-600' },
  { status: 'REJECTED', label: 'Rejected', tone: 'rej', bar: 'bg-danger' },
];

export function StatusStrip({ counts }: { counts: Record<ResultStatus, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${total} sheets: ${STATUS_ROWS.map((s) => `${counts[s.status]} ${s.label.toLowerCase()}`).join(', ')}`}>
        {STATUS_ROWS.filter((s) => counts[s.status] > 0).map((s) => (
          <span key={s.status} className={s.bar} style={{ flex: counts[s.status] }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_ROWS.map((s) => (
          <div key={s.status} className="flex flex-col items-start gap-1.5">
            <Badge tone={s.tone}>{s.label}</Badge>
            <span className="num text-[22px] font-bold">{counts[s.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivityFeed({ items, link, loading }: { items?: ActivityItem[]; link: string; loading?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-4">
        <h2 className="m-0 text-base font-semibold">Recent activity</h2>
        <Link to={link} className="text-sm font-semibold">
          {link.endsWith('audit') ? 'Audit log' : 'Activity log'}
        </Link>
      </div>
      {loading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : items && items.length ? (
        <ul className="m-0 list-none p-0">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-b border-line-soft px-4 py-3 last:border-b-0">
              <span className="num w-[150px] shrink-0 text-[13px] text-muted">{formatDateTime(a.createdAt)}</span>
              <span className="min-w-0 flex-[1_1_300px] text-sm">
                <strong>{a.actor}</strong> <span className="text-muted">·</span> {a.label}
                <span className="block text-[13px] text-ink-2">{a.summary}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 px-4 py-6 text-sm text-muted">No recent activity.</p>
      )}
    </Card>
  );
}

export function DeptDashboardPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['dashboard', 'department'], queryFn: () => api.get<DeptDashboard>('/dashboard/department') });

  if (error) return <Banner kind="error" title="We couldn’t load the dashboard.">{error.message}</Banner>;
  const s = data?.stats;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">{data?.department?.name ?? <Skeleton className="h-7 w-56" />}</h1>
        <p className="m-0 text-sm text-muted">
          {data?.department?.faculty} · {data?.semester?.label ?? 'No active semester'}
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-4">
        <StatCard label="Students" loading={isPending} value={s?.students} to="/dept/students" />
        <StatCard label="Lecturers" loading={isPending} value={s?.lecturers} to="/dept/lecturers" />
        <StatCard label="Courses" loading={isPending} value={s?.courses} to="/dept/courses" />
        <StatCard label="Courses offered" loading={isPending} value={s?.offerings} to="/dept/offerings" />
        <StatCard label="Registrations" loading={isPending} value={s?.registrations.toLocaleString('en-GB')} to="/dept/registrations" />
        <StatCard label="Results pending approval" loading={isPending} value={s?.pendingApproval} highlight={!!s?.pendingApproval} sub={s?.pendingApproval ? 'Review now →' : 'Nothing waiting'} to="/dept/results" />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-start gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="m-0 text-base font-semibold">Pending approvals</h2>
            <Link to="/dept/results" className="text-sm font-semibold">
              All result sheets
            </Link>
          </div>
          {data && data.pending.length === 0 ? (
            <p className="m-0 px-4 py-6 text-sm text-muted">No result sheets are waiting for your approval.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="[&>th]:border-b [&>th]:border-line [&>th]:bg-subtle [&>th]:px-4 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-[0.04em] [&>th]:whitespace-nowrap [&>th]:text-[#555F5A] [&>th]:uppercase">
                    <th>Course</th>
                    <th>Submitted</th>
                    <th>
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.pending.map((p) => (
                    <tr key={p.offeringId} className="[&>td]:border-b [&>td]:border-line-soft [&>td]:px-4 [&>td]:py-3 [&>td]:whitespace-nowrap">
                      <td>
                        <strong>{p.code}</strong>
                        <div className="text-[13px] text-muted">{p.title}</div>
                      </td>
                      <td>
                        {p.submittedBy ?? p.lecturers.join(', ')}
                        <div className="num text-[13px] text-muted">{formatDateTime(p.submittedAt)}</div>
                      </td>
                      <td className="text-right">
                        <ButtonLink to={`/dept/results/${p.offeringId}`} size="sm">
                          Review
                        </ButtonLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="m-0 bg-subtle px-4 py-3 text-[13px] text-muted">Courses owned by other departments (e.g. MTH courses taken by your students) are approved by that department’s admin.</p>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="m-0 text-base font-semibold">Result sheets this semester</h2>
          {data ? <StatusStrip counts={data.resultCounts} /> : <Skeleton className="h-16" />}
          <h3 className="m-0 mt-2 text-sm font-semibold">Active students by level</h3>
          <BarList items={(data?.studentsByLevel ?? []).map((l) => ({ label: `${l.level} Level`, value: l.count }))} emptyText="No students yet." />
        </Card>
      </div>

      <ActivityFeed items={data?.activity} link="/dept/activity" loading={isPending} />
    </>
  );
}
