import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, levelLabel, plural } from '../../lib/format';
import type { Semester } from '../../lib/types';
import { CsvButton, DepartmentFilter, LEVELS, SemesterSelect, useAdminScope, useOptions } from '../../components/shared';
import { Card, cx, EmptyState, PageHeader, Skeleton, StatusBadge } from '../../components/ui/primitives';
import { FilterSelect, SearchInput } from '../../components/ui/form';
import { DataTable, Pagination, type Column } from '../../components/ui/table';
import type { OfferingRow } from './Offerings';
import { useDebounced } from './Students';

type Registration = {
  id: string;
  matricNo: string;
  studentId: string;
  studentName: string;
  program: string;
  department: string | null;
  level: number;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  units: number;
  registeredAt: string;
};

type RegistrationList = {
  semester: Semester | null;
  items: Registration[];
  total: number;
  students?: number;
  page: number;
  pageSize: number;
};

const th = 'border-b border-line bg-subtle px-4 py-2.5 text-left text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';
const td = 'border-b border-line-soft px-4 py-2.5 whitespace-nowrap';

function CourseRegistrants({ offeringId, semesterId }: { offeringId: string; semesterId: string }) {
  const params = { offeringId, semesterId, pageSize: 200 };
  const list = useQuery({
    queryKey: ['registrations', params],
    queryFn: () => api.get<RegistrationList>('/registrations', params),
  });
  if (list.isPending) {
    return (
      <div className="flex flex-col gap-2 px-5 py-4">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    );
  }
  if (list.error) return <p className="m-0 px-5 py-4 text-sm text-danger-ink">{list.error.message}</p>;
  if (list.data.items.length === 0) return <p className="m-0 px-5 py-4 text-sm text-muted">Nobody has registered for this course yet.</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={th}>Matric no.</th>
            <th className={th}>Student</th>
            <th className={th}>Programme</th>
            <th className={th}>Level</th>
            <th className={th}>Registered</th>
          </tr>
        </thead>
        <tbody>
          {list.data.items.map((r) => (
            <tr key={r.id}>
              <td className={`${td} num font-medium`}>{r.matricNo}</td>
              <td className={td}>{r.studentName}</td>
              <td className={td}>{r.program}</td>
              <td className={`${td} num`}>{r.level}</td>
              <td className={`${td} text-muted`}>{formatDate(r.registeredAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ByCourse({ semesterId, departmentId, search }: { semesterId: string; departmentId: string; search: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const params = { semesterId, departmentId, q: search };
  const list = useQuery({
    queryKey: ['offerings', params],
    queryFn: () => api.get<{ semester: Semester | null; items: OfferingRow[] }>('/offerings', params),
    placeholderData: keepPreviousData,
  });

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (list.isPending) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/5" />
      </Card>
    );
  }
  if (list.error) {
    return (
      <Card>
        <EmptyState icon={ClipboardList} tone="danger" message={list.error.message} />
      </Card>
    );
  }
  const items = list.data.items;
  const semester = list.data.semester;
  const total = items.reduce((sum, o) => sum + o.registered, 0);

  return (
    <Card className="overflow-hidden">
      <div className="num flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5 text-[13px] text-muted">
        <span>
          {plural(items.length, 'course')} offered{semester ? ` in ${semester.label}` : ''}
        </span>
        <span>{plural(total, 'registration')}</span>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={ClipboardList} tone="muted" message="No courses offered in this semester." />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((o) => {
            const expanded = open.has(o.id);
            return (
              <li key={o.id} className="border-b border-line-soft last:border-b-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`reg-${o.id}`}
                  onClick={() => toggle(o.id)}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 border-0 bg-transparent px-5 py-3.5 text-left hover:bg-hover"
                >
                  <ChevronRight className={cx('size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-90')} aria-hidden />
                  <span className="flex min-w-[200px] flex-1 flex-col">
                    <span className="text-sm font-semibold">
                      {o.course.code} <span className="font-normal text-ink-2">· {o.course.title}</span>
                    </span>
                    <span className="text-[13px] text-muted">
                      {o.course.units} units · {levelLabel(o.course.level)} · {o.lecturers.map((l) => l.name).join(', ') || 'No lecturer assigned'}
                    </span>
                  </span>
                  <StatusBadge status={o.status} />
                  <span className="num w-24 text-right text-sm">
                    <strong>{o.registered}</strong>
                    <span className="text-muted"> / {o.capacity ?? '∞'}</span>
                  </span>
                </button>
                {expanded && (
                  <div id={`reg-${o.id}`} className="border-t border-line-soft bg-subtle/40">
                    <CourseRegistrants offeringId={o.id} semesterId={semester?.id ?? semesterId} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function RegistrationsPage() {
  const { isSuper, departmentName } = useAdminScope();
  const options = useOptions();
  const [view, setView] = useState<'student' | 'course'>('student');
  const [semesterId, setSemesterId] = useState('');
  const [programId, setProgramId] = useState('');
  const [level, setLevel] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());

  useEffect(() => setPage(1), [semesterId, programId, level, departmentId, search]);

  const filters = { semesterId, programId, level, departmentId, q: search };
  const params = { ...filters, page, pageSize: 50 };
  const list = useQuery({
    queryKey: ['registrations', params],
    queryFn: () => api.get<RegistrationList>('/registrations', params),
    placeholderData: keepPreviousData,
    enabled: view === 'student',
  });

  const filtered = !!(programId || level || search);

  const columns: Column<Registration>[] = [
    { key: 'matric', header: 'Matric no.', render: (r) => <span className="num font-medium">{r.matricNo}</span>, sortValue: (r) => r.matricNo },
    { key: 'student', header: 'Student', render: (r) => r.studentName, sortValue: (r) => r.studentName },
    ...(isSuper ? [{ key: 'dept', header: 'Department', render: (r: Registration) => r.department ?? '—', sortValue: (r: Registration) => r.department ?? '' }] : []),
    { key: 'program', header: 'Programme', render: (r) => r.program, className: 'whitespace-normal min-w-[150px]' },
    { key: 'level', header: 'Level', render: (r) => <span className="num">{r.level}</span>, sortValue: (r) => r.level },
    {
      key: 'course',
      header: 'Course',
      render: (r) => (
        <span>
          <span className="font-semibold">{r.courseCode}</span> <span className="text-muted">· {r.courseTitle}</span>
        </span>
      ),
      sortValue: (r) => r.courseCode,
      className: 'whitespace-normal min-w-[200px]',
    },
    { key: 'units', header: 'Units', align: 'right', render: (r) => <span className="num">{r.units}</span> },
    { key: 'date', header: 'Registered', render: (r) => <span className="text-muted">{formatDate(r.registeredAt)}</span>, sortValue: (r) => r.registeredAt },
  ];

  const viewToggle = (
    <div role="group" aria-label="View" className="inline-flex rounded-lg border border-line-strong bg-white p-0.5">
      {(
        [
          ['student', 'By student'],
          ['course', 'By course'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => setView(value)}
          className={cx(
            'h-9 cursor-pointer rounded-md border-0 px-3.5 text-[13px] font-semibold',
            view === value ? 'bg-brand-50 text-brand' : 'bg-transparent text-ink-2 hover:bg-surface',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Registrations"
        description={
          isSuper
            ? 'Course registrations across the university.'
            : `${departmentName} students’ registrations, and anyone registered for a ${departmentName} course.`
        }
        actions={
          <>
            {viewToggle}
            <CsvButton path="/registrations" query={filters} />
          </>
        }
      />

      {view === 'student' ? (
        <DataTable
          caption="Course registrations"
          columns={columns}
          rows={list.data?.items}
          rowKey={(r) => r.id}
          loading={list.isPending}
          error={list.error}
          onRetry={() => list.refetch()}
          toolbar={
            <>
              <SearchInput label="Search registrations" placeholder="Search student name or matric no." value={q} onChange={setQ} />
              <SemesterSelect value={semesterId} onChange={setSemesterId} />
              <FilterSelect label="Programme" value={programId} onChange={setProgramId}>
                <option value="">All programmes</option>
                {options.data?.programs
                  .filter((p) => !departmentId || p.departmentId === departmentId)
                  .map((p) => (
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
              <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
              {list.data && (
                <span className="num ml-auto text-[13px] text-muted">
                  {plural(list.data.total, 'registration')}
                  {list.data.students !== undefined ? ` · ${plural(list.data.students, 'student')}` : ''}
                </span>
              )}
            </>
          }
          empty={
            <EmptyState
              icon={filtered ? Search : ClipboardList}
              tone="muted"
              message={filtered ? 'No registrations match these filters.' : `No registrations${list.data?.semester ? ` in ${list.data.semester.label}` : ''} yet.`}
            />
          }
          footer={list.data && list.data.total > 0 && <Pagination page={page} pageSize={50} total={list.data.total} onPage={setPage} noun="registrations" />}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput label="Search courses" placeholder="Search course code or title" value={q} onChange={setQ} />
            <SemesterSelect value={semesterId} onChange={setSemesterId} />
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
          </div>
          <ByCourse semesterId={semesterId} departmentId={departmentId} search={search} />
        </>
      )}
    </>
  );
}
