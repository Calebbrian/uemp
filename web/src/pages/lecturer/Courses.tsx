import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { api } from '../../lib/api';
import type { Semester } from '../../lib/types';
import { ButtonLink, EmptyState, PageHeader, StatusBadge } from '../../components/ui/primitives';
import { DataTable } from '../../components/ui/table';
import { SemesterSelect } from '../../components/shared';
import type { LecturerCourse } from './Dashboard';

export function LecturerCoursesPage() {
  const [semesterId, setSemesterId] = useState('');
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['lecturer', 'offerings', semesterId],
    queryFn: () => api.get<{ semester: Semester | null; items: LecturerCourse[] }>('/lecturer/offerings', { semesterId }),
  });

  return (
    <>
      <PageHeader title="My Courses" description="Courses you are assigned to teach. Open a course to enter or review scores." />
      <DataTable
        caption="Assigned courses"
        toolbar={<SemesterSelect value={semesterId} onChange={setSemesterId} />}
        rows={data?.items}
        loading={isPending}
        error={error}
        onRetry={refetch}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/lecturer/courses/${r.id}`)}
        empty={<EmptyState icon={BookOpen} message={`You have no courses assigned in ${data?.semester?.label ?? 'this semester'}.`} />}
        columns={[
          { key: 'code', header: 'Code', render: (r) => <span className="font-semibold">{r.code}</span>, sortValue: (r) => r.code },
          { key: 'title', header: 'Title', render: (r) => r.title },
          { key: 'units', header: 'Units', align: 'right', render: (r) => <span className="num">{r.units}</span> },
          { key: 'level', header: 'Level', align: 'right', render: (r) => <span className="num">{r.level}</span>, sortValue: (r) => r.level },
          { key: 'students', header: 'Students', align: 'right', render: (r) => <span className="num">{r.students}</span>, sortValue: (r) => r.students },
          { key: 'scored', header: 'Scored', align: 'right', render: (r) => <span className="num text-muted">{r.graded} / {r.students}</span> },
          { key: 'status', header: 'Result status', render: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
          {
            key: 'open',
            header: <span className="sr-only">Open</span>,
            align: 'right',
            render: (r) => (
              <span onClick={(e) => e.stopPropagation()}>
                <ButtonLink to={`/lecturer/courses/${r.id}`} variant="secondary" size="sm">
                  Open score sheet
                </ButtonLink>
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
