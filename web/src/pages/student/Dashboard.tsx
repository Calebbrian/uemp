import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { api } from '../../lib/api';
import { fullName, gpaText, initials } from '../../lib/format';
import type { Me, Semester, TranscriptCourse } from '../../lib/types';
import { Banner, ButtonLink, Card, cx, RegistrationBadge, Skeleton, StatCard } from '../../components/ui/primitives';

type Dashboard = {
  profile: Me;
  semester: Semester | null;
  registration: { courses: number; units: number };
  cgpa: number | null;
  classOfDegree: string | null;
  lastGpa: number | null;
  unitsPassed: number;
  recentResults: { semester: Semester; gpa: number | null; courses: TranscriptCourse[] } | null;
};

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function StudentDashboardPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['student', 'dashboard'],
    queryFn: () => api.get<Dashboard>('/student/dashboard'),
  });

  if (error) return <Banner kind="error" title="We couldn’t load your dashboard.">{error.message}</Banner>;

  const p = data?.profile;
  const s = p?.student;
  const open = data?.semester?.registrationOpen ?? false;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">{p ? `${greeting()}, ${p.firstName}` : <Skeleton className="h-7 w-64" />}</h1>
        <p className="m-0 text-sm text-muted">Here’s where you stand this semester.</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-4">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 font-bold text-brand">{p ? initials(p) : ''}</span>
            <div className="flex flex-col">
              <h2 className="m-0 text-base font-semibold">{p ? fullName(p) : <Skeleton className="h-4 w-40" />}</h2>
              <span className="num text-[13px] text-muted">{s?.matricNo}</span>
            </div>
            <span className="flex-1" />
            <Link to="/student/profile" className="text-sm font-semibold">
              My profile
            </Link>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
            {[
              ['Programme', s?.program.name],
              ['Department', p?.department?.name],
              ['Faculty', p?.department?.faculty.name.replace('Faculty of ', '')],
              ['Level', s ? `${s.level} Level` : undefined],
              ['Entry year', s?.entryYear],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs font-medium text-muted">{k}</dt>
                <dd className="num m-0 mt-0.5 text-sm font-semibold">{v ?? <Skeleton className="h-4 w-20" />}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className={cx('flex flex-col gap-3 p-5', open && 'border-[#B7DCC6] bg-[#F4FAF6]')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-base font-semibold">{data?.semester?.label ?? (isPending ? <Skeleton className="h-4 w-48" /> : 'No active semester')}</h2>
            {data?.semester && <RegistrationBadge open={open} />}
          </div>
          {data && (
            <p className="m-0 text-sm leading-[21px] text-ink-2">
              {data.registration.courses === 0 ? (
                'You haven’t registered any courses this semester yet.'
              ) : (
                <>
                  You’ve registered{' '}
                  <strong className="num">
                    {data.registration.courses} course{data.registration.courses === 1 ? '' : 's'} ({data.registration.units} units)
                  </strong>
                  .
                </>
              )}{' '}
              {open ? 'Registration is open, so you can still add or drop courses.' : 'Registration is closed.'}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            {open && <ButtonLink to="/student/registration">Register courses</ButtonLink>}
            <ButtonLink to="/student/courses" variant="secondary">
              View my courses
            </ButtonLink>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        <StatCard label="CGPA" icon={Award} loading={isPending} value={<span className="text-brand">{gpaText(data?.cgpa)}</span>} sub={data?.classOfDegree ?? 'No approved results yet'} />
        <StatCard label="Last semester GPA" loading={isPending} value={gpaText(data?.lastGpa)} sub={data?.recentResults?.semester.label ?? '—'} />
        <StatCard label="Courses registered" loading={isPending} value={data?.registration.courses ?? 0} sub="This semester" />
        <StatCard
          label="Total units"
          loading={isPending}
          value={
            <>
              {data?.registration.units ?? 0} <span className="text-[15px] font-medium text-muted">/ 24 max</span>
            </>
          }
          sub="This semester"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="m-0 text-base font-semibold">Recent results</h2>
            <span className="text-[13px] text-muted">{data?.recentResults ? `${data.recentResults.semester.label} · approved` : 'Approved results appear here'}</span>
          </div>
          <Link to="/student/results" className="text-sm font-semibold">
            View all results
          </Link>
        </div>
        {data?.recentResults ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="[&>th]:border-b [&>th]:border-line [&>th]:bg-subtle [&>th]:px-5 [&>th]:py-2.5 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-[0.04em] [&>th]:text-[#555F5A] [&>th]:uppercase">
                    <th className="text-left">Code</th>
                    <th className="text-left">Title</th>
                    <th className="text-right">Units</th>
                    <th className="text-right">Total</th>
                    <th className="text-left">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentResults.courses.map((c) => (
                    <tr key={c.code} className="num [&>td]:border-b [&>td]:border-line-soft [&>td]:px-5 [&>td]:py-3 [&>td]:whitespace-nowrap">
                      <td className="font-semibold">{c.code}</td>
                      <td>{c.title}</td>
                      <td className="text-right">{c.units}</td>
                      <td className="text-right">{c.totalScore}</td>
                      <td className="font-bold">{c.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="num flex flex-wrap gap-6 bg-subtle px-5 py-3.5 text-sm">
              <span>
                Semester GPA <strong>{gpaText(data.recentResults.gpa)}</strong>
              </span>
              <span>
                Cumulative GPA <strong>{gpaText(data.cgpa)}</strong>
              </span>
            </div>
          </>
        ) : (
          !isPending && <p className="m-0 border-t border-line px-5 py-6 text-sm text-muted">No approved results yet.</p>
        )}
      </Card>
    </>
  );
}
