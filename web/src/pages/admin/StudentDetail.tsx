import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Award, BookOpen, ClipboardCheck, GraduationCap, KeyRound, Pencil, UserX } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, gpaText, levelLabel, plural } from '../../lib/format';
import type { ResultStatus, Semester, Transcript } from '../../lib/types';
import { useAdminScope } from '../../components/shared';
import { Badge, Banner, Button, Card, DescriptionList, EmptyState, PageHeader, SectionCard, Spinner, StatCard, StatusBadge } from '../../components/ui/primitives';
import { StudentFormDrawer, useResetPassword, type StudentRow } from './Students';

type StudentDetail = {
  student: StudentRow;
  registrations: {
    semester: Semester;
    units: number;
    courses: { enrollmentId: string; code: string; title: string; units: number; resultStatus: ResultStatus }[];
  }[];
  transcript: Transcript;
};

const th = 'border-b border-line bg-subtle px-4 py-2.5 text-left text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';
const td = 'border-b border-line-soft px-4 py-2.5 whitespace-nowrap';

export function StudentDetailPage() {
  const { id = '' } = useParams();
  const { base, isSuper } = useAdminScope();
  const [editing, setEditing] = useState(false);
  const reset = useResetPassword((sid) => `/students/${sid}/reset-password`);
  const detail = useQuery({ queryKey: ['student', id], queryFn: () => api.get<StudentDetail>(`/students/${id}`) });

  const listCrumb = isSuper ? { label: 'Users', to: '/admin/users' } : { label: 'Students', to: `${base}/students` };

  if (detail.isPending) return <Spinner label="Loading student" />;
  if (detail.error) {
    return (
      <>
        <PageHeader title="Student" breadcrumb={[listCrumb, { label: 'Not available' }]} />
        <Card>
          <EmptyState icon={UserX} tone="danger" message={detail.error.message} />
        </Card>
      </>
    );
  }

  const { student, registrations, transcript } = detail.data;
  const current = registrations.find((r) => r.semester.isCurrent);
  const resultSemesters = transcript.semesters.filter((s) => s.courses.length > 0);

  return (
    <>
      <PageHeader
        breadcrumb={[listCrumb, { label: student.name }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {student.name} <StatusBadge status={student.status} />
          </span>
        }
        description={`${student.matricNo} · ${student.program.name} · ${levelLabel(student.level)}`}
        actions={
          <>
            <Button variant="secondary" icon={KeyRound} onClick={() => reset.start({ id: student.id, name: student.name })}>
              Reset password
            </Button>
            <Button icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
          </>
        }
      />

      {student.status !== 'ACTIVE' && (
        <Banner kind="warning" title={`This account is ${student.status.toLowerCase()}.`}>
          The student cannot sign in. Account status is managed by the super admin under Users.
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="CGPA" icon={Award} value={<span className="text-brand">{gpaText(transcript.cgpa)}</span>} sub={transcript.classOfDegree ?? 'No approved results yet'} />
        <StatCard label="Last semester GPA" icon={GraduationCap} value={gpaText(transcript.lastGpa)} sub={resultSemesters[0]?.semester.label ?? '—'} />
        <StatCard label="Units passed" icon={BookOpen} value={transcript.unitsPassed} sub={`of ${transcript.unitsAttempted} attempted`} />
        <StatCard label="This semester" icon={ClipboardCheck} value={current?.courses.length ?? 0} sub={current ? `${current.units} units registered` : 'Not registered'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <SectionCard title="Profile">
          <DescriptionList
            items={[
              { label: 'Email', value: student.email },
              { label: 'Phone', value: student.phone ?? '—' },
              { label: 'Matric number', value: <span className="num">{student.matricNo}</span> },
              { label: 'Department', value: student.department?.name ?? '—' },
              { label: 'Programme', value: student.program.name },
              { label: 'Level', value: levelLabel(student.level) },
              { label: 'Entry year', value: <span className="num">{student.entryYear}</span> },
              { label: 'Gender', value: student.gender ?? '—' },
              { label: 'Date of birth', value: formatDate(student.dateOfBirth) },
              { label: 'Last sign-in', value: formatDateTime(student.lastLoginAt) },
              { label: 'Address', value: student.address ?? '—' },
            ]}
          />
        </SectionCard>

        <SectionCard title="Registrations by semester" bodyClass="p-0">
          {registrations.length === 0 ? (
            <EmptyState icon={ClipboardCheck} tone="muted" message="No course registrations yet." />
          ) : (
            <div className="flex flex-col">
              {registrations.map((r) => (
                <div key={r.semester.id} className="border-b border-line last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
                    <h3 className="m-0 text-sm font-semibold">
                      {r.semester.label}
                      {r.semester.isCurrent && <span className="ml-2 align-middle"><Badge tone="info">Current</Badge></span>}
                    </h3>
                    <span className="num text-[13px] text-muted">
                      {plural(r.courses.length, 'course')} · {r.units} units
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className={th}>Course</th>
                          <th className={th}>Title</th>
                          <th className={`${th} text-right`}>Units</th>
                          <th className={th}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.courses.map((c) => (
                          <tr key={c.enrollmentId}>
                            <td className={`${td} font-medium`}>{c.code}</td>
                            <td className={td}>{c.title}</td>
                            <td className={`${td} num text-right`}>{c.units}</td>
                            <td className={td}>
                              <StatusBadge status={c.resultStatus} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">Approved results</h2>
        {resultSemesters.length === 0 ? (
          <Card>
            <EmptyState icon={Award} tone="muted" message="No approved results yet. Results appear here once the department approves them." />
          </Card>
        ) : (
          resultSemesters.map((s) => (
            <Card key={s.semester.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
                <h3 className="m-0 text-[15px] font-semibold">{s.semester.label}</h3>
                {s.pending > 0 && <span className="text-[13px] text-sub-fg">{plural(s.pending, 'course')} awaiting approval</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={th}>Code</th>
                      <th className={th}>Title</th>
                      <th className={`${th} text-right`}>Units</th>
                      <th className={`${th} text-right`}>CA</th>
                      <th className={`${th} text-right`}>Exam</th>
                      <th className={`${th} text-right`}>Total</th>
                      <th className={`${th} text-center`}>Grade</th>
                      <th className={`${th} text-right`}>Point</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {s.courses.map((c) => (
                      <tr key={c.code}>
                        <td className={`${td} font-medium`}>{c.code}</td>
                        <td className={td}>{c.title}</td>
                        <td className={`${td} text-right`}>{c.units}</td>
                        <td className={`${td} text-right`}>{c.caScore}</td>
                        <td className={`${td} text-right`}>{c.examScore}</td>
                        <td className={`${td} text-right font-semibold`}>{c.totalScore}</td>
                        <td className={`${td} text-center font-semibold ${c.grade === 'F' ? 'text-danger-ink' : ''}`}>{c.grade}</td>
                        <td className={`${td} text-right`}>{c.gradePoint}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="num flex flex-wrap justify-end gap-6 bg-subtle px-5 py-3 text-sm">
                <span>
                  Units <strong>{s.units}</strong>
                </span>
                <span>
                  GPA <strong>{gpaText(s.gpa)}</strong>
                </span>
                <span>
                  CGPA <strong className="text-brand">{gpaText(s.cgpa)}</strong>
                </span>
              </div>
            </Card>
          ))
        )}
      </section>

      {editing && <StudentFormDrawer student={student} onClose={() => setEditing(false)} />}
      {reset.dialogs}
    </>
  );
}
