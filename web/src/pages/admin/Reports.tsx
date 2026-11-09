import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartColumn, ClipboardList, Users } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { gpaText, levelLabel, plural } from '../../lib/format';
import type { AccountStatus, ResultStatus, Semester } from '../../lib/types';
import { cx, EmptyState, PageHeader, StatusBadge } from '../../components/ui/primitives';
import { FilterSelect } from '../../components/ui/form';
import { DataTable, type Column } from '../../components/ui/table';
import { CsvButton, DepartmentFilter, LEVELS, SemesterSelect, useAdminScope, useOptions } from '../../components/shared';

type ReportKey = 'students' | 'registrations' | 'performance';

const REPORTS: { key: ReportKey; title: string; description: string; icon: typeof Users }[] = [
  { key: 'students', title: 'Student list', description: 'Students by programme, level and status.', icon: Users },
  { key: 'registrations', title: 'Course registrations', description: 'Registered students per course offering.', icon: ClipboardList },
  { key: 'performance', title: 'Academic performance', description: 'Averages, pass rates and grades per course; CGPA by level.', icon: ChartColumn },
];

type StudentRow = {
  id: string;
  matricNo: string;
  name: string;
  email: string;
  status: AccountStatus;
  level: number;
  entryYear: number;
  program: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
};

type RegistrationRow = {
  offeringId: string;
  code: string;
  title: string;
  units: number;
  level: number;
  department: string;
  lecturers: string[];
  registered: number;
  capacity: number | null;
};

type CourseRow = {
  offeringId: string;
  code: string;
  title: string;
  status: ResultStatus;
  students: number;
  graded: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
  distribution: Record<string, number>;
};

type LevelRow = { level: number; students: number; averageCgpa: number; highestCgpa: number; lowestCgpa: number };

function Summary({ children }: { children: React.ReactNode }) {
  return <div className="num px-4 py-3 text-[13px] text-muted">{children}</div>;
}

function StudentReport({ departmentId }: { departmentId: string }) {
  const { base } = useAdminScope();
  const options = useOptions();
  const [programId, setProgramId] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const filters = { departmentId, programId, level, status };

  const query = useQuery({
    queryKey: ['reports', 'students', filters],
    queryFn: () => api.get<{ items: StudentRow[]; total: number }>('/reports/students', filters),
  });

  const programs = (options.data?.programs ?? []).filter((p) => !departmentId || p.departmentId === departmentId);

  const columns: Column<StudentRow>[] = [
    {
      key: 'matric',
      header: 'Matric no.',
      className: 'num font-medium',
      sortValue: (s) => s.matricNo,
      render: (s) => <Link to={`${base}/students/${s.id}`}>{s.matricNo}</Link>,
    },
    { key: 'name', header: 'Name', sortValue: (s) => s.name, render: (s) => s.name },
    { key: 'program', header: 'Programme', sortValue: (s) => s.program.name, render: (s) => s.program.name },
    { key: 'level', header: 'Level', className: 'num', sortValue: (s) => s.level, render: (s) => s.level },
    { key: 'entry', header: 'Entry year', className: 'num', sortValue: (s) => s.entryYear, render: (s) => s.entryYear },
    { key: 'email', header: 'Email', className: 'text-muted', render: (s) => s.email },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
  ];

  return (
    <DataTable
      caption="Student list"
      columns={columns}
      rows={query.data?.items}
      rowKey={(s) => s.id}
      loading={query.isPending}
      error={query.error}
      onRetry={() => query.refetch()}
      toolbar={
        <>
          <FilterSelect label="Programme" value={programId} onChange={setProgramId}>
            <option value="">All programmes</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Level" value={level} onChange={setLevel}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {levelLabel(l)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" value={status} onChange={setStatus}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </FilterSelect>
          <span className="flex-1" />
          <CsvButton path="/reports/students" query={filters} />
        </>
      }
      empty={<EmptyState icon={Users} tone="muted" message="No students match these filters." />}
      footer={query.data && <Summary>{plural(query.data.total, 'student')}</Summary>}
    />
  );
}

function RegistrationReport({ departmentId }: { departmentId: string }) {
  const [semesterId, setSemesterId] = useState('');
  const filters = { departmentId, semesterId };
  const query = useQuery({
    queryKey: ['reports', 'registrations', filters],
    queryFn: () =>
      api.get<{ semester: Semester | null; items: RegistrationRow[]; totals?: { offerings: number; registrations: number } }>('/reports/registrations', filters),
  });

  const columns: Column<RegistrationRow>[] = [
    { key: 'code', header: 'Course', className: 'font-semibold', sortValue: (r) => r.code, render: (r) => r.code },
    { key: 'title', header: 'Title', sortValue: (r) => r.title, render: (r) => r.title },
    { key: 'units', header: 'Units', align: 'right', className: 'num', render: (r) => r.units },
    { key: 'level', header: 'Level', align: 'right', className: 'num', sortValue: (r) => r.level, render: (r) => r.level },
    { key: 'dept', header: 'Department', render: (r) => r.department },
    { key: 'lecturers', header: 'Lecturers', render: (r) => (r.lecturers.length ? r.lecturers.join(', ') : <span className="text-muted">Not assigned</span>) },
    {
      key: 'registered',
      header: 'Registered',
      sortValue: (r) => r.registered,
      render: (r) => {
        const pct = r.capacity ? Math.min(100, (r.registered / r.capacity) * 100) : null;
        return (
          <div className="flex min-w-[150px] items-center gap-2.5">
            <span className="num w-[72px] font-semibold">
              {r.registered}
              {r.capacity !== null && <span className="font-normal text-muted"> / {r.capacity}</span>}
            </span>
            {pct !== null && (
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden>
                <span className={cx('block h-full rounded-full', pct >= 100 ? 'bg-danger' : 'bg-brand-600')} style={{ width: `${pct}%` }} />
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      caption="Course registration report"
      columns={columns}
      rows={query.data?.items}
      rowKey={(r) => r.offeringId}
      loading={query.isPending}
      error={query.error}
      onRetry={() => query.refetch()}
      toolbar={
        <>
          <SemesterSelect value={semesterId} onChange={setSemesterId} />
          <span className="flex-1" />
          <CsvButton path="/reports/registrations" query={filters} />
        </>
      }
      empty={<EmptyState icon={ClipboardList} tone="muted" message="No courses are offered in this semester." />}
      footer={
        query.data?.totals && (
          <Summary>
            {query.data.semester?.label} · {plural(query.data.totals.offerings, 'course')} offered · {plural(query.data.totals.registrations, 'registration')}
          </Summary>
        )
      }
    />
  );
}

function PerformanceReport({ departmentId }: { departmentId: string }) {
  const [semesterId, setSemesterId] = useState('');
  const filters = { departmentId, semesterId };
  const query = useQuery({
    queryKey: ['reports', 'performance', filters],
    queryFn: () => api.get<{ semester: Semester | null; courses: CourseRow[]; levels: LevelRow[]; grades: string[] }>('/reports/performance', filters),
  });
  const grades = query.data?.grades ?? ['A', 'B', 'C', 'D', 'E', 'F'];

  const columns: Column<CourseRow>[] = [
    { key: 'code', header: 'Course', className: 'font-semibold', sortValue: (c) => c.code, render: (c) => c.code },
    { key: 'title', header: 'Title', className: 'max-w-[240px] truncate', render: (c) => <span title={c.title}>{c.title}</span> },
    { key: 'status', header: 'Results', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'students', header: 'Students', align: 'right', className: 'num', render: (c) => (c.graded === c.students ? c.students : `${c.graded} / ${c.students}`) },
    { key: 'average', header: 'Average', align: 'right', className: 'num', sortValue: (c) => c.average, render: (c) => c.average?.toFixed(1) ?? '—' },
    {
      key: 'range',
      header: 'Range',
      align: 'right',
      className: 'num text-ink-2',
      render: (c) => (c.lowest === null ? '—' : `${c.lowest}–${c.highest}`),
    },
    { key: 'pass', header: 'Pass rate', align: 'right', className: 'num', sortValue: (c) => c.passRate, render: (c) => (c.passRate === null ? '—' : `${Math.round(c.passRate)}%`) },
    ...grades.map<Column<CourseRow>>((g) => ({
      key: `grade-${g}`,
      header: g,
      align: 'center',
      className: cx('num', g === 'F' && 'text-danger-ink'),
      render: (c) => (c.graded ? (c.distribution[g] ?? 0) : '—'),
    })),
  ];

  const levelColumns: Column<LevelRow>[] = [
    { key: 'level', header: 'Level', render: (l) => levelLabel(l.level) },
    { key: 'students', header: 'Students with results', align: 'right', className: 'num', render: (l) => l.students },
    { key: 'avg', header: 'Average CGPA', align: 'right', className: 'num font-semibold', render: (l) => gpaText(l.averageCgpa) },
    { key: 'high', header: 'Highest', align: 'right', className: 'num', render: (l) => gpaText(l.highestCgpa) },
    { key: 'low', header: 'Lowest', align: 'right', className: 'num', render: (l) => gpaText(l.lowestCgpa) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <DataTable
        caption="Performance by course"
        columns={columns}
        rows={query.data?.courses}
        rowKey={(c) => c.offeringId}
        loading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        toolbar={
          <>
            <SemesterSelect value={semesterId} onChange={setSemesterId} />
            <span className="flex-1" />
            <CsvButton path="/reports/performance" query={filters} />
          </>
        }
        empty={<EmptyState icon={ChartColumn} tone="muted" message="No courses are offered in this semester." />}
        footer={
          query.data?.semester && (
            <Summary>
              {query.data.semester.label}. Figures include every score entered so far, whatever the result status.
            </Summary>
          )
        }
      />
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-[15px] font-semibold">Average CGPA by level</h2>
        <DataTable
          caption="Average CGPA by level"
          columns={levelColumns}
          rows={query.data?.levels}
          rowKey={(l) => String(l.level)}
          loading={query.isPending}
          empty={<EmptyState icon={ChartColumn} tone="muted" message="No approved results yet for active students." />}
          footer={<Summary>Based on approved results of active students only.</Summary>}
        />
      </section>
    </div>
  );
}

export function ReportsPage() {
  const { isSuper, departmentName } = useAdminScope();
  const [report, setReport] = useState<ReportKey>('students');
  const [departmentId, setDepartmentId] = useState('');

  return (
    <>
      <PageHeader
        title="Reports"
        description={isSuper ? 'University-wide reports. Filter by department or export any table to CSV.' : `Reports for ${departmentName}. Export any table to CSV.`}
        actions={<DepartmentFilter value={departmentId} onChange={setDepartmentId} />}
      />

      <div role="tablist" aria-label="Reports" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {REPORTS.map((r) => {
          const selected = report === r.key;
          return (
            <button
              key={r.key}
              type="button"
              role="tab"
              id={`tab-${r.key}`}
              aria-selected={selected}
              aria-controls={`panel-${r.key}`}
              onClick={() => setReport(r.key)}
              className={cx(
                'flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-4 text-left',
                selected ? 'border-brand shadow-[0_0_0_1px_var(--color-brand)]' : 'border-line hover:border-line-strong',
              )}
            >
              <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-brand text-white' : 'bg-brand-50 text-brand')}>
                <r.icon className="size-[18px]" aria-hidden />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-ink">{r.title}</span>
                <span className="text-[13px] text-muted">{r.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${report}`} aria-labelledby={`tab-${report}`}>
        {report === 'students' && <StudentReport departmentId={departmentId} />}
        {report === 'registrations' && <RegistrationReport departmentId={departmentId} />}
        {report === 'performance' && <PerformanceReport departmentId={departmentId} />}
      </div>
    </>
  );
}
