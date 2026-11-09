import { useQuery } from '@tanstack/react-query';
import { Award, Clock, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { gpaText } from '../../lib/format';
import type { Transcript } from '../../lib/types';
import { Banner, ButtonLink, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/primitives';

const th = 'border-b border-line bg-subtle px-4 py-2.5 text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';
const td = 'border-b border-line-soft px-4 py-[11px] whitespace-nowrap';

export function useTranscript() {
  return useQuery({ queryKey: ['student', 'results'], queryFn: () => api.get<Transcript>('/student/results') });
}

export function ResultsPage() {
  const { data, isPending, error } = useTranscript();

  if (isPending) return <Spinner label="Loading results" />;
  if (error) return <Banner kind="error" title="We couldn’t load your results.">{error.message}</Banner>;

  const completed = data.semesters.filter((s) => s.courses.length > 0).length;

  return (
    <>
      <PageHeader
        title="Results"
        description="Only results approved by your department appear here."
        actions={
          completed > 0 && (
            <ButtonLink to="/student/print/results" variant="secondary" icon={Printer}>
              Print result statement
            </ButtonLink>
          )
        }
      />

      <Card className="flex flex-wrap items-center gap-x-12 gap-y-6 px-6 py-5" aria-label="Summary">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-muted">CGPA</span>
          <span className="num text-4xl leading-[42px] font-bold text-brand">{gpaText(data.cgpa)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-muted">Class of degree (current)</span>
          <span className="text-lg font-semibold">{data.classOfDegree ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-muted">Total units passed</span>
          <span className="num text-lg font-semibold">{data.unitsPassed}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-muted">Semesters completed</span>
          <span className="num text-lg font-semibold">{completed}</span>
        </div>
      </Card>

      {data.semesters.length === 0 && (
        <Card>
          <EmptyState icon={Award} message="You don’t have any results yet. They will appear here once your department approves them." />
        </Card>
      )}

      {data.semesters.map((s) =>
        s.courses.length === 0 ? (
          <Card key={s.semester.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" aria-label={s.semester.label}>
            <div className="flex flex-col gap-0.5">
              <h2 className="m-0 text-base font-semibold">{s.semester.label}</h2>
              <span className="text-[13px] text-muted">No results released yet</span>
            </div>
            {s.pending > 0 && <PendingChip count={s.pending} />}
          </Card>
        ) : (
          <Card key={s.semester.id} className="overflow-hidden" aria-label={s.semester.label}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 className="m-0 text-base font-semibold">{s.semester.label}</h2>
              <div className="flex flex-wrap items-center gap-3">
                {s.pending > 0 && <PendingChip count={s.pending} />}
                <span className="num text-[13px] text-muted">{s.units} units</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`${th} text-left`}>Code</th>
                    <th className={`${th} text-left`}>Title</th>
                    <th className={`${th} text-right`}>Units</th>
                    <th className={`${th} text-right`}>CA /40</th>
                    <th className={`${th} text-right`}>Exam /60</th>
                    <th className={`${th} text-right`}>Total</th>
                    <th className={`${th} text-left`}>Grade</th>
                    <th className={`${th} text-right`}>Point</th>
                  </tr>
                </thead>
                <tbody>
                  {s.courses.map((c) => (
                    <tr key={c.code} className="num">
                      <td className={`${td} font-semibold`}>{c.code}</td>
                      <td className={td}>{c.title}</td>
                      <td className={`${td} text-right`}>{c.units}</td>
                      <td className={`${td} text-right`}>{c.caScore}</td>
                      <td className={`${td} text-right`}>{c.examScore}</td>
                      <td className={`${td} text-right font-semibold`}>{c.totalScore}</td>
                      <td className={`${td} font-bold ${c.gradePoint === 0 ? 'text-danger-ink' : ''}`}>{c.grade}</td>
                      <td className={`${td} text-right`}>{c.gradePoint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="num flex flex-wrap gap-7 bg-subtle px-5 py-3 text-sm">
              <span>
                Semester GPA <strong>{gpaText(s.gpa)}</strong>
              </span>
              <span>
                Cumulative GPA <strong>{gpaText(s.cgpa)}</strong>
              </span>
            </div>
          </Card>
        ),
      )}
    </>
  );
}

function PendingChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-sub-bg px-3 py-1.5 text-[13px] font-semibold text-[#5C3900]">
      <Clock className="size-3.5" aria-hidden />
      {count} course{count === 1 ? '' : 's'} awaiting approval
    </span>
  );
}
