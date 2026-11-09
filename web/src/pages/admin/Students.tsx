import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Eye, KeyRound, Pencil, Plus, Search, Users, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { levelLabel } from '../../lib/format';
import type { AccountStatus, DeptRef, Paged } from '../../lib/types';
import { CsvButton, DepartmentFilter, LEVELS, useAdminScope, useOptions } from '../../components/shared';
import { Button, buttonClass, cx, EmptyState, PageHeader, StatusBadge } from '../../components/ui/primitives';
import { FilterSelect, SearchInput, SelectField, TextAreaField, TextField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Drawer, TempPasswordDialog } from '../../components/ui/overlay';
import { DataTable, Pagination, type Column } from '../../components/ui/table';
import { useToast } from '../../components/ui/toast';

export type StudentRow = {
  id: string;
  matricNo: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  status: AccountStatus;
  level: number;
  entryYear: number;
  gender: string | null;
  dateOfBirth: string | null;
  address: string | null;
  lastLoginAt: string | null;
  program: { id: string; code: string; name: string };
  department: DeptRef | null;
};

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export type RowAction = { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean };

/** Row "more" menu. Rendered with fixed positioning so the table's overflow does not clip it. */
export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onDown = (e: Event) => {
      const target = e.target as Node;
      if (menu.current?.contains(target) || button.current?.contains(target)) return;
      setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPos(null);
        button.current?.focus();
      }
    };
    const onScroll = () => setPos(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [pos]);

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = button.current!.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    setPos(r.bottom + 220 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };

  return (
    <div onClick={(e) => e.stopPropagation()} className="inline-block">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={toggle}
        className={cx(buttonClass('ghost', 'sm'), 'w-8 px-0')}
      >
        <Ellipsis className="size-4" strokeWidth={2.5} aria-hidden />
      </button>
      {pos && (
        <div
          ref={menu}
          role="menu"
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="z-50 flex min-w-[190px] flex-col gap-0.5 rounded-xl border border-line bg-white p-1.5 text-left shadow-overlay"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              type="button"
              disabled={a.disabled}
              onClick={() => {
                setPos(null);
                a.onSelect();
              }}
              className={cx(
                'flex h-9 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-3 text-left text-sm whitespace-nowrap hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45',
                a.danger ? 'text-danger-ink' : 'text-ink',
              )}
            >
              {a.icon && <a.icon className="size-4" aria-hidden />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const GENDERS = ['Female', 'Male'];

type StudentSaved = { student: StudentRow; tempPassword?: string };

export function StudentFormDrawer({
  student,
  onClose,
  onCreated,
}: {
  student: StudentRow | null;
  onClose: () => void;
  onCreated?: (student: StudentRow, tempPassword: string) => void;
}) {
  const { isSuper, departmentName } = useAdminScope();
  const options = useOptions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm({
    firstName: student?.firstName ?? '',
    lastName: student?.lastName ?? '',
    email: student?.email ?? '',
    phone: student?.phone ?? '',
    matricNo: student?.matricNo ?? '',
    programId: student?.program.id ?? '',
    level: String(student?.level ?? 100),
    entryYear: String(student?.entryYear ?? new Date().getFullYear()),
    gender: student?.gender ?? '',
    dateOfBirth: student?.dateOfBirth?.slice(0, 10) ?? '',
    address: student?.address ?? '',
  });

  const programs = options.data?.programs ?? [];
  const deptCode = (id: string) => options.data?.departments.find((d) => d.id === id)?.code;
  const program = programs.find((p) => p.id === form.values.programId);
  const maxLevel = (program?.durationYears ?? 6) * 100;

  const save = useMutation({
    mutationFn: () => {
      const v = form.values;
      const body = {
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        phone: v.phone || null,
        matricNo: v.matricNo,
        programId: v.programId,
        level: Number(v.level),
        entryYear: Number(v.entryYear),
        gender: v.gender || null,
        dateOfBirth: v.dateOfBirth || null,
        address: v.address || null,
      };
      return student ? api.patch<StudentSaved>(`/students/${student.id}`, body) : api.post<StudentSaved>('/students', body);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['student'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (student) {
        toast.success('Student updated', `${data.student.name} · ${data.student.matricNo}`);
        onClose();
      } else {
        onCreated?.(data.student, data.tempPassword ?? '');
      }
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error(student ? 'Couldn’t update student' : 'Couldn’t create student', errorMessage(err));
    },
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={student ? `Edit ${student.name}` : 'Add student'}
      width={460}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {student ? 'Save changes' : 'Create student'}
          </Button>
        </>
      }
    >
      {!isSuper && <p className="m-0 -mt-1 text-[13px] text-muted">{departmentName} department</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="First name" required autoComplete="off" {...form.bind('firstName')} />
        <TextField label="Last name" required autoComplete="off" {...form.bind('lastName')} />
      </div>
      <TextField label="Email" type="email" required placeholder="name@uemp.test" autoComplete="off" {...form.bind('email')} />
      <TextField label="Phone" type="tel" placeholder="080…" {...form.bind('phone')} />
      <TextField label="Matric number" required className="num" placeholder="CSC/2026/001" {...form.bind('matricNo')} />
      <SelectField
        label="Programme"
        required
        help={!isSuper ? `Only programmes in ${departmentName}` : undefined}
        {...form.bind('programId')}
      >
        <option value="">Select a programme…</option>
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {isSuper ? ` (${deptCode(p.departmentId) ?? ''})` : ''}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField label="Level" required {...form.bind('level')}>
          {LEVELS.filter((l) => l <= maxLevel).map((l) => (
            <option key={l} value={l}>
              {levelLabel(l)}
            </option>
          ))}
        </SelectField>
        <TextField label="Entry year" required inputMode="numeric" {...form.bind('entryYear')} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField label="Gender" {...form.bind('gender')}>
          <option value="">Select…</option>
          {GENDERS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </SelectField>
        <TextField label="Date of birth" type="date" {...form.bind('dateOfBirth')} />
      </div>
      <TextAreaField label="Address" {...form.bind('address')} />
      {!student && <p className="m-0 text-[13px] text-muted">A temporary password is generated and shown once after you create the student.</p>}
    </Drawer>
  );
}

/** Confirm, reset, then show the one-time password. */
export function useResetPassword(path: (id: string) => string) {
  const toast = useToast();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [result, setResult] = useState<{ name: string; password: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (t: { id: string; name: string }) => api.post<{ tempPassword: string }>(path(t.id)),
    onSuccess: (data, t) => {
      setTarget(null);
      setResult({ name: t.name, password: data.tempPassword });
    },
    onError: (err) => toast.error('Couldn’t reset password', errorMessage(err)),
  });

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={() => { if (target) mutation.mutate(target); }}
        title={`Reset password for ${target?.name ?? ''}?`}
        message="Their current password stops working and they are signed out everywhere. You’ll get a one-time password to hand over."
        confirmLabel="Reset password"
        loading={mutation.isPending}
      />
      <TempPasswordDialog open={!!result} onClose={() => setResult(null)} title="Password reset" name={result?.name ?? ''} password={result?.password ?? ''} />
    </>
  );
  return { start: setTarget, dialogs };
}

export function StudentsPage() {
  const { base, isSuper, departmentName } = useAdminScope();
  const navigate = useNavigate();
  const options = useOptions();
  const [q, setQ] = useState('');
  const [programId, setProgramId] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());

  useEffect(() => setPage(1), [search, programId, level, status, departmentId]);

  const filters = { q: search, programId, level, status, departmentId };
  const params = { ...filters, page, pageSize: 25 };
  const list = useQuery({
    queryKey: ['students', params],
    queryFn: () => api.get<Paged<StudentRow>>('/students', params),
    placeholderData: keepPreviousData,
  });

  const [editing, setEditing] = useState<StudentRow | 'new' | null>(null);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const reset = useResetPassword((id) => `/students/${id}/reset-password`);

  const filtered = !!(search || programId || level || status || departmentId);
  const clearFilters = () => {
    setQ('');
    setProgramId('');
    setLevel('');
    setStatus('');
    setDepartmentId('');
  };

  const columns: Column<StudentRow>[] = [
    { key: 'matric', header: 'Matric no.', render: (s) => <span className="num font-medium">{s.matricNo}</span>, sortValue: (s) => s.matricNo },
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <Link to={`${base}/students/${s.id}`} className="font-medium text-ink! hover:underline" onClick={(e) => e.stopPropagation()}>
          {s.name}
        </Link>
      ),
      sortValue: (s) => `${s.lastName} ${s.firstName}`,
    },
    { key: 'program', header: 'Programme', render: (s) => s.program.name },
    { key: 'level', header: 'Level', render: (s) => <span className="num">{s.level}</span>, sortValue: (s) => s.level },
    { key: 'email', header: 'Email', render: (s) => <span className="text-muted">{s.email}</span> },
    ...(isSuper ? [{ key: 'dept', header: 'Dept', render: (s: StudentRow) => s.department?.code ?? '—' }] : []),
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (s) => (
        <RowMenu
          label={`Actions for ${s.name}`}
          actions={[
            { label: 'View', icon: Eye, onSelect: () => navigate(`${base}/students/${s.id}`) },
            { label: 'Edit', icon: Pencil, onSelect: () => setEditing(s) },
            { label: 'Reset password', icon: KeyRound, onSelect: () => reset.start({ id: s.id, name: s.name }) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Students"
        description={isSuper ? 'Students across every department.' : `Everyone enrolled in a ${departmentName} department programme.`}
        actions={
          <>
            <CsvButton path="/students" query={filters} />
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add student
            </Button>
          </>
        }
      />

      <DataTable
        caption="Students"
        columns={columns}
        rows={list.data?.items}
        rowKey={(s) => s.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        onRowClick={(s) => navigate(`${base}/students/${s.id}`)}
        toolbar={
          <>
            <SearchInput label="Search students" placeholder="Search name, matric no. or email" value={q} onChange={setQ} />
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
            <FilterSelect label="Status" value={status} onChange={setStatus}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </FilterSelect>
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
            {list.data && <span className="num ml-auto text-[13px] text-muted">{list.data.total} students</span>}
          </>
        }
        empty={
          filtered ? (
            <EmptyState
              icon={Search}
              tone="muted"
              message="No students match these filters."
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Users} message="No students registered yet." action={<Button onClick={() => setEditing('new')}>Add student</Button>} />
          )
        }
        footer={list.data && list.data.total > 0 && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} noun="students" />}
      />

      {editing && (
        <StudentFormDrawer
          key={editing === 'new' ? 'new' : editing.id}
          student={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(s, password) => {
            setEditing(null);
            setCreated({ name: s.name, password });
          }}
        />
      )}
      <TempPasswordDialog open={!!created} onClose={() => setCreated(null)} title="Student created" name={created?.name ?? ''} password={created?.password ?? ''} />
      {reset.dialogs}
    </>
  );
}
