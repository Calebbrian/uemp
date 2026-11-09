import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, KeyRound, Pencil, UserX } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime, plural } from '../../lib/format';
import type { ResultStatus, Semester } from '../../lib/types';
import { useAdminScope } from '../../components/shared';
import { Badge, Button, Card, DescriptionList, EmptyState, PageHeader, SectionCard, Spinner, StatusBadge } from '../../components/ui/primitives';
import { LecturerFormDrawer, type LecturerRow } from './Lecturers';
import { useResetPassword } from './Students';

type LecturerDetail = {
  lecturer: LecturerRow;
  allocations: {
    semester: Semester;
    courses: { offeringId: string; code: string; title: string; units: number; students: number; status: ResultStatus }[];
  }[];
};

const th = 'border-b border-line bg-subtle px-4 py-2.5 text-left text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';
const td = 'border-b border-line-soft px-4 py-2.5 whitespace-nowrap';

export function LecturerDetailPage() {
  const { id = '' } = useParams();
  const { base, isSuper } = useAdminScope();
  const [editing, setEditing] = useState(false);
  const reset = useResetPassword((lid) => `/lecturers/${lid}/reset-password`);
  const detail = useQuery({ queryKey: ['lecturer', id], queryFn: () => api.get<LecturerDetail>(`/lecturers/${id}`) });

  const listCrumb = isSuper ? { label: 'Users', to: '/admin/users' } : { label: 'Lecturers', to: `${base}/lecturers` };

  if (detail.isPending) return <Spinner label="Loading lecturer" />;
  if (detail.error) {
    return (
      <>
        <PageHeader title="Lecturer" breadcrumb={[listCrumb, { label: 'Not available' }]} />
        <Card>
          <EmptyState icon={UserX} tone="danger" message={detail.error.message} />
        </Card>
      </>
    );
  }

  const { lecturer, allocations } = detail.data;

  return (
    <>
      <PageHeader
        breadcrumb={[listCrumb, { label: lecturer.name }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lecturer.name} <StatusBadge status={lecturer.status} />
          </span>
        }
        description={[lecturer.rank, lecturer.staffId, lecturer.department?.name].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="secondary" icon={KeyRound} onClick={() => reset.start({ id: lecturer.id, name: lecturer.name })}>
              Reset password
            </Button>
            <Button icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <SectionCard title="Profile">
          <DescriptionList
            items={[
              { label: 'Email', value: lecturer.email },
              { label: 'Phone', value: lecturer.phone ?? '—' },
              { label: 'Staff ID', value: <span className="num">{lecturer.staffId}</span> },
              { label: 'Rank', value: lecturer.rank ?? '—' },
              { label: 'Department', value: lecturer.department?.name ?? '—' },
              { label: 'Last sign-in', value: formatDateTime(lecturer.lastLoginAt) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Teaching allocations" bodyClass="p-0">
          {allocations.length === 0 ? (
            <EmptyState icon={BookOpen} tone="muted" message="Not assigned to any course yet. Assign lecturers from Course Offerings." />
          ) : (
            allocations.map((a) => (
              <div key={a.semester.id} className="border-b border-line last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
                  <h3 className="m-0 text-sm font-semibold">
                    {a.semester.label}
                    {a.semester.isCurrent && (
                      <span className="ml-2 align-middle">
                        <Badge tone="info">Current</Badge>
                      </span>
                    )}
                  </h3>
                  <span className="num text-[13px] text-muted">{plural(a.courses.length, 'course')}</span>
                </div>
                <div className="relative overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Course</th>
                        <th className={th}>Title</th>
                        <th className={`${th} text-right`}>Units</th>
                        <th className={`${th} text-right`}>Students</th>
                        <th className={th}>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.courses.map((c) => (
                        <tr key={c.offeringId}>
                          <td className={`${td} font-medium`}>
                            <Link to={`${base}/results/${c.offeringId}`} className="hover:underline">
                              {c.code}
                            </Link>
                          </td>
                          <td className={td}>{c.title}</td>
                          <td className={`${td} num text-right`}>{c.units}</td>
                          <td className={`${td} num text-right`}>{c.students}</td>
                          <td className={td}>
                            <StatusBadge status={c.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </SectionCard>
      </div>

      {editing && <LecturerFormDrawer lecturer={lecturer} onClose={() => setEditing(false)} />}
      {reset.dialogs}
    </>
  );
}
