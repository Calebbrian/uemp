import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Semester } from '../../lib/types';
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '../../components/ui/primitives';
import { FilterSelect } from '../../components/ui/form';
import { DataTable } from '../../components/ui/table';

type CourseRow = {
  enrollmentId: string;
  code: string;
  title: string;
  units: number;
  department: string;
  lecturers: string[];
  resultReleased: boolean;
  registeredAt: string;
};

export function MyCoursesPage() {
  const [semesterId, setSemesterId] = useState('');
  const semesters = useQuery({ queryKey: ['student', 'semesters'], queryFn: () => api.get<{ items: Semester[] }>('/student/semesters') });
  const courses = useQuery({
    queryKey: ['student', 'courses', semesterId],
    queryFn: () => api.get<{ semester: Semester | null; courses: CourseRow[]; totalUnits: number }>('/student/courses', { semesterId }),
  });
  const isCurrent = courses.data?.semester?.isCurrent ?? false;

  return (
    <>
      <PageHeader
        title="My Courses"
        description="Courses you are registered for, by semester."
        actions={
          isCurrent &&
          (courses.data?.courses.length ?? 0) > 0 && (
            <ButtonLink to="/student/print/registration" variant="secondary" icon={Printer}>
              Print registration slip
            </ButtonLink>
          )
        }
      />
      <DataTable
        caption="Registered courses"
        toolbar={
          <FilterSelect label="Semester" value={semesterId} onChange={setSemesterId}>
            <option value="">Current semester</option>
            {semesters.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </FilterSelect>
        }
        rows={courses.data?.courses}
        loading={courses.isPending}
        error={courses.error}
        onRetry={() => courses.refetch()}
        rowKey={(r) => r.enrollmentId}
        empty={
          <EmptyState
            icon={BookOpen}
            message={isCurrent ? 'You haven’t registered any courses this semester.' : 'No courses registered in this semester.'}
            action={isCurrent && <ButtonLink to="/student/registration">Register courses</ButtonLink>}
          />
        }
        columns={[
          { key: 'code', header: 'Code', render: (r) => <span className="font-semibold">{r.code}</span>, sortValue: (r) => r.code },
          { key: 'title', header: 'Title', render: (r) => r.title },
          { key: 'units', header: 'Units', align: 'right', render: (r) => <span className="num">{r.units}</span> },
          { key: 'lecturers', header: 'Lecturer(s)', render: (r) => r.lecturers.join(', ') || '—' },
          { key: 'registered', header: 'Registered', render: (r) => <span className="text-muted">{formatDate(r.registeredAt)}</span> },
          {
            key: 'result',
            header: 'Result',
            render: (r) => <Badge tone={r.resultReleased ? 'ok' : 'draft'}>{r.resultReleased ? 'Released' : 'Pending'}</Badge>,
          },
        ]}
        footer={
          (courses.data?.courses.length ?? 0) > 0 && (
            <div className="num flex justify-between bg-subtle px-4 py-3 text-sm font-semibold">
              <span>{courses.data!.courses.length} courses</span>
              <span>Total units: {courses.data!.totalUnits}</span>
            </div>
          )
        }
      />
      <Card className="px-5 py-4 text-[13px] text-muted">
        “Released” means your department has approved the results for that course. Scores appear under Results once released.
      </Card>
    </>
  );
}
