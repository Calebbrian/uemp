import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Eye, KeyRound, Pencil, Plus, Search } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { AccountStatus, DeptRef, Paged } from '../../lib/types';
import { DepartmentFilter, useAdminScope, useOptions } from '../../components/shared';
import { Button, EmptyState, PageHeader, StatusBadge } from '../../components/ui/primitives';
import { FilterSelect, SearchInput, SelectField, TextField, useForm } from '../../components/ui/form';
import { Drawer, TempPasswordDialog } from '../../components/ui/overlay';
import { DataTable, Pagination, type Column } from '../../components/ui/table';
import { useToast } from '../../components/ui/toast';
import { applyDuplicateError, RowMenu, useDebounced, useResetPassword } from './Students';

export type LecturerRow = {
  id: string;
  staffId: string;
  rank: string | null;
  title: string | null;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  status: AccountStatus;
  lastLoginAt: string | null;
  department: DeptRef | null;
  currentCourses: string[];
};

const TITLES = ['Prof.', 'Dr.', 'Engr.', 'Mr.', 'Mrs.', 'Ms.'];
const RANKS = ['Professor', 'Reader', 'Senior Lecturer', 'Lecturer I', 'Lecturer II', 'Assistant Lecturer', 'Graduate Assistant'];

type LecturerSaved = { lecturer: LecturerRow; tempPassword?: string };

export function LecturerFormDrawer({
  lecturer,
  onClose,
  onCreated,
}: {
  lecturer: LecturerRow | null;
  onClose: () => void;
  onCreated?: (lecturer: LecturerRow, tempPassword: string) => void;
}) {
  const { isSuper, departmentName } = useAdminScope();
  const options = useOptions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm({
    title: lecturer?.title ?? '',
    firstName: lecturer?.firstName ?? '',
    lastName: lecturer?.lastName ?? '',
    email: lecturer?.email ?? '',
    phone: lecturer?.phone ?? '',
    staffId: lecturer?.staffId ?? '',
    rank: lecturer?.rank ?? '',
    departmentId: lecturer?.department?.id ?? '',
  });

  const save = useMutation({
    mutationFn: () => {
      const v = form.values;
      const body = {
        title: v.title || null,
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        phone: v.phone || null,
        staffId: v.staffId,
        rank: v.rank || null,
        ...(isSuper ? { departmentId: v.departmentId || undefined } : {}),
      };
      return lecturer ? api.patch<LecturerSaved>(`/lecturers/${lecturer.id}`, body) : api.post<LecturerSaved>('/lecturers', body);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lecturers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['lecturer'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (lecturer) {
        toast.success('Lecturer updated', data.lecturer.name);
        onClose();
      } else {
        onCreated?.(data.lecturer, data.tempPassword ?? '');
      }
    },
    onError: (err) => {
      if (form.applyError(err) || applyDuplicateError(err, form.setErrors, { email: 'This email', staffId: 'This staff ID' })) return;
      toast.error(lecturer ? 'Couldn’t update lecturer' : 'Couldn’t create lecturer', errorMessage(err));
    },
  });

  const submit = () => {
    if (isSuper && !form.values.departmentId) {
      form.setErrors({ departmentId: 'Choose a department' });
      return;
    }
    save.mutate();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={lecturer ? `Edit ${lecturer.name}` : 'Add lecturer'}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {lecturer ? 'Save changes' : 'Create lecturer'}
          </Button>
        </>
      }
    >
      {!isSuper && <p className="m-0 -mt-1 text-[13px] text-muted">{departmentName} department</p>}
      <SelectField label="Title" {...form.bind('title')}>
        <option value="">None</option>
        {TITLES.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </SelectField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="First name" required autoComplete="off" {...form.bind('firstName')} />
        <TextField label="Last name" required autoComplete="off" {...form.bind('lastName')} />
      </div>
      <TextField label="Email" type="email" required placeholder="name@uemp.test" autoComplete="off" {...form.bind('email')} />
      <TextField label="Phone" type="tel" placeholder="080…" {...form.bind('phone')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Staff ID" required placeholder="STF/CSC/013" {...form.bind('staffId')} />
        <SelectField label="Rank" {...form.bind('rank')}>
          <option value="">Select…</option>
          {RANKS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </SelectField>
      </div>
      {isSuper && (
        <SelectField label="Department" required {...form.bind('departmentId')}>
          <option value="">Select a department…</option>
          {options.data?.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
      )}
      {!lecturer && <p className="m-0 text-[13px] text-muted">A temporary password is generated and shown once after you create the lecturer.</p>}
    </Drawer>
  );
}

export function LecturersPage() {
  const { base, isSuper, departmentName } = useAdminScope();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());

  useEffect(() => setPage(1), [search, status, departmentId]);

  const params = { q: search, status, departmentId, page, pageSize: 25 };
  const list = useQuery({
    queryKey: ['lecturers', params],
    queryFn: () => api.get<Paged<LecturerRow>>('/lecturers', params),
    placeholderData: keepPreviousData,
  });

  const [editing, setEditing] = useState<LecturerRow | 'new' | null>(null);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const reset = useResetPassword((id) => `/lecturers/${id}/reset-password`);
  const filtered = !!(search || status || departmentId);

  const columns: Column<LecturerRow>[] = [
    { key: 'staff', header: 'Staff ID', render: (l) => <span className="num font-medium">{l.staffId}</span>, sortValue: (l) => l.staffId },
    {
      key: 'name',
      header: 'Name',
      render: (l) => (
        <Link to={`${base}/lecturers/${l.id}`} className="font-medium text-ink! hover:underline" onClick={(e) => e.stopPropagation()}>
          {l.name}
        </Link>
      ),
      sortValue: (l) => `${l.lastName} ${l.firstName}`,
    },
    { key: 'rank', header: 'Rank', render: (l) => l.rank ?? '—' },
    { key: 'email', header: 'Email', render: (l) => <span className="text-muted">{l.email}</span> },
    ...(isSuper ? [{ key: 'dept', header: 'Dept', render: (l: LecturerRow) => l.department?.code ?? '—' }] : []),
    {
      key: 'courses',
      header: 'Courses this semester',
      render: (l) =>
        l.currentCourses.length ? <span className="text-ink-2">{l.currentCourses.join(', ')}</span> : <span className="text-muted">None assigned</span>,
      sortValue: (l) => l.currentCourses.length,
    },
    { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
    {
      key: 'actions',
      header: (
        <span className="relative">
          <span className="sr-only">Actions</span>
        </span>
      ),
      align: 'right',
      render: (l) => (
        <RowMenu
          label={`Actions for ${l.name}`}
          actions={[
            { label: 'View', icon: Eye, onSelect: () => navigate(`${base}/lecturers/${l.id}`) },
            { label: 'Edit', icon: Pencil, onSelect: () => setEditing(l) },
            { label: 'Reset password', icon: KeyRound, onSelect: () => reset.start({ id: l.id, name: l.name }) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Lecturers"
        description={isSuper ? 'Teaching staff in every department.' : `Teaching staff in ${departmentName}.`}
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add lecturer
          </Button>
        }
      />

      <DataTable
        caption="Lecturers"
        columns={columns}
        rows={list.data?.items}
        rowKey={(l) => l.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        onRowClick={(l) => navigate(`${base}/lecturers/${l.id}`)}
        toolbar={
          <>
            <SearchInput label="Search lecturers" placeholder="Search name, staff ID or email" value={q} onChange={setQ} />
            <FilterSelect label="Status" value={status} onChange={setStatus}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </FilterSelect>
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
            {list.data && <span className="num ml-auto text-[13px] text-muted">{list.data.total} lecturers</span>}
          </>
        }
        empty={
          filtered ? (
            <EmptyState icon={Search} tone="muted" message="No lecturers match these filters." />
          ) : (
            <EmptyState icon={Briefcase} message="No lecturers yet." action={<Button onClick={() => setEditing('new')}>Add lecturer</Button>} />
          )
        }
        footer={list.data && list.data.total > 0 && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} noun="lecturers" />}
      />

      {editing && (
        <LecturerFormDrawer
          key={editing === 'new' ? 'new' : editing.id}
          lecturer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(l, password) => {
            setEditing(null);
            setCreated({ name: l.name, password });
          }}
        />
      )}
      <TempPasswordDialog open={!!created} onClose={() => setCreated(null)} title="Lecturer created" name={created?.name ?? ''} password={created?.password ?? ''} />
      {reset.dialogs}
    </>
  );
}
