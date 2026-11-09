import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Plus, Users as UsersIcon } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, ROLE_LABEL } from '../../lib/format';
import type { AccountStatus, Paged, Role } from '../../lib/types';
import { Button, cx, EmptyState, PageHeader, StatusBadge } from '../../components/ui/primitives';
import { FilterSelect, SearchInput, SelectField, TextField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Drawer, TempPasswordDialog } from '../../components/ui/overlay';
import { DataTable, Pagination, type Column } from '../../components/ui/table';
import { useToast } from '../../components/ui/toast';
import { DepartmentFilter, LEVELS, useAdminScope, useOptions } from '../../components/shared';

type UserRow = {
  id: string;
  email: string;
  title: string | null;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  role: Role;
  status: AccountStatus;
  lastLoginAt: string | null;
  department: { id: string; code: string; name: string } | null;
  matricNo: string | null;
  program: string | null;
  level: number | null;
  staffId: string | null;
  rank: string | null;
};

type UsersResponse = Paged<UserRow> & { roleCounts: Partial<Record<Role, number>> };

const ROLES: Role[] = ['STUDENT', 'LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'];
const TABS: { value: Role | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'STUDENT', label: 'Students' },
  { value: 'LECTURER', label: 'Lecturers' },
  { value: 'DEPT_ADMIN', label: 'Department Admins' },
  { value: 'SUPER_ADMIN', label: 'Super Admins' },
];

const isStaff = (role: Role) => role !== 'STUDENT';
const needsDepartment = (role: Role) => role === 'LECTURER' || role === 'DEPT_ADMIN';

function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function invalidateUsers(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ['users', 'students', 'lecturers', 'departments', 'faculties']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

// Row menu --------------------------------------------------------------------

type MenuItem = { label: string; onSelect: () => void; danger?: boolean; separatorBefore?: boolean };

/** Rendered in a portal with fixed positioning so the table's scroll container cannot clip it. */
function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const height = items.length * 40 + 20;
    const below = rect.bottom + 4 + height < window.innerHeight;
    setPos({ top: below ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), right: window.innerWidth - rect.right });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') {
          setOpen(false);
          buttonRef.current?.focus();
        }
        return;
      }
      if (e.type === 'mousedown' && (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open, pos]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-ink hover:bg-[#EEF1EF]"
      >
        <Ellipsis className="size-4" strokeWidth={2.5} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            className="fixed z-50 w-[210px] rounded-[10px] border border-line bg-white p-1.5 text-left shadow-overlay"
            style={{ top: pos.top, right: pos.right }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next = e.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }}
          >
            {items.map((item) => (
              <div key={item.label}>
                {item.separatorBefore && <div className="my-1 h-px bg-line-soft" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cx(
                    'block w-full cursor-pointer rounded-md border-0 bg-transparent px-3 py-[9px] text-left text-sm hover:bg-surface focus-visible:bg-surface',
                    item.danger ? 'text-danger-ink' : 'text-ink',
                  )}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

// Drawers ---------------------------------------------------------------------

const EMPTY_CREATE = {
  role: '' as Role | '',
  title: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  matricNo: '',
  programId: '',
  level: '',
  entryYear: String(new Date().getFullYear()),
  departmentId: '',
  staffId: '',
  rank: '',
};

function CreateUserDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const options = useOptions();
  const form = useForm(EMPTY_CREATE);
  const role = form.values.role;

  const create = useMutation({
    mutationFn: () => {
      const v = form.values;
      const base = { role: v.role, title: v.title, firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone };
      if (v.role === 'STUDENT') return api.post<{ user: UserRow; tempPassword: string }>('/users', { ...base, matricNo: v.matricNo, programId: v.programId, level: v.level, entryYear: v.entryYear });
      if (v.role === 'LECTURER') return api.post<{ user: UserRow; tempPassword: string }>('/users', { ...base, departmentId: v.departmentId, staffId: v.staffId, rank: v.rank });
      if (v.role === 'DEPT_ADMIN') return api.post<{ user: UserRow; tempPassword: string }>('/users', { ...base, departmentId: v.departmentId });
      return api.post<{ user: UserRow; tempPassword: string }>('/users', base);
    },
    onSuccess: (data) => {
      invalidateUsers(queryClient);
      form.reset();
      onClose();
      onCreated(data.user.name, data.tempPassword);
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t create user', errorMessage(err));
    },
  });

  const programs = options.data?.programs ?? [];
  const selectedProgram = programs.find((p) => p.id === form.values.programId);
  const maxLevel = selectedProgram ? selectedProgram.durationYears * 100 : 500;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create user"
      onSubmit={() => {
        if (!role) {
          form.setErrors({ role: 'Choose a role first' });
          return;
        }
        create.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!role}>
            Create user
          </Button>
        </>
      }
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">
          Role <span className="text-danger-ink">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <label
              key={r}
              className={cx(
                'flex h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm font-medium',
                role === r ? 'border-brand bg-brand-50 text-brand shadow-[0_0_0_1px_var(--color-brand)]' : 'border-line-strong text-ink-2 hover:bg-surface',
              )}
            >
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => form.set('role', r)} className="accent-brand" />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
        {form.errors.role && <div className="mt-1.5 text-xs font-medium text-danger-ink">{form.errors.role}</div>}
      </fieldset>

      {role && (
        <>
          {isStaff(role) && <TextField label="Title" placeholder="Dr., Prof., Mrs." {...form.bind('title')} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="First name" required {...form.bind('firstName')} />
            <TextField label="Last name" required {...form.bind('lastName')} />
          </div>
          <TextField label="Email" type="email" required autoComplete="off" {...form.bind('email')} />
          <TextField label="Phone" type="tel" {...form.bind('phone')} />

          {role === 'STUDENT' && (
            <>
              <TextField label="Matric number" required placeholder="CSC/2026/015" {...form.bind('matricNo')} />
              <SelectField label="Programme" required {...form.bind('programId')}>
                <option value="">Choose a programme</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Level" required {...form.bind('level')}>
                  <option value="">Choose level</option>
                  {LEVELS.filter((l) => l <= maxLevel).map((l) => (
                    <option key={l} value={l}>
                      {l} Level
                    </option>
                  ))}
                </SelectField>
                <TextField label="Entry year" required inputMode="numeric" className="num" {...form.bind('entryYear')} />
              </div>
              <p className="m-0 text-[13px] text-muted">The student’s department follows their programme.</p>
            </>
          )}

          {needsDepartment(role) && (
            <SelectField label="Department" required {...form.bind('departmentId')}>
              <option value="">Choose a department</option>
              {options.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          )}

          {role === 'LECTURER' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Staff ID" required placeholder="STF/CSC/013" {...form.bind('staffId')} />
              <TextField label="Rank" placeholder="Lecturer II" {...form.bind('rank')} />
            </div>
          )}

          {role === 'SUPER_ADMIN' && (
            <p className="m-0 rounded-md bg-sub-bg px-3 py-2.5 text-[13px] text-[#5C3900]">
              Super admins have university-wide access to every department, account and setting.
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}

function EditUserDrawer({ user, open, onClose }: { user: UserRow; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const options = useOptions();
  const form = useForm({
    title: user.title ?? '',
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? '',
    departmentId: user.department?.id ?? '',
  });

  const save = useMutation({
    mutationFn: () => {
      const { departmentId, ...rest } = form.values;
      return api.patch(`/users/${user.id}`, needsDepartment(user.role) ? { ...rest, departmentId } : rest);
    },
    onSuccess: () => {
      toast.success('User updated', user.email);
      invalidateUsers(queryClient);
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t update user', errorMessage(err));
    },
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Edit ${user.name}`}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <p className="m-0 text-[13px] text-muted">{ROLE_LABEL[user.role]}</p>
      {isStaff(user.role) && <TextField label="Title" placeholder="Dr., Prof., Mrs." {...form.bind('title')} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="First name" required {...form.bind('firstName')} />
        <TextField label="Last name" required {...form.bind('lastName')} />
      </div>
      <TextField label="Email" type="email" required {...form.bind('email')} />
      <TextField label="Phone" type="tel" {...form.bind('phone')} />
      {needsDepartment(user.role) && (
        <SelectField label="Department" required {...form.bind('departmentId')}>
          <option value="">Choose a department</option>
          {options.data?.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
      )}
      {user.role === 'STUDENT' && (
        <p className="m-0 text-[13px] text-muted">
          {user.matricNo} · {user.program}. A student’s department follows their programme; change it from the department’s student records.
        </p>
      )}
    </Drawer>
  );
}

function ChangeRoleDrawer({ user, open, onClose }: { user: UserRow; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const options = useOptions();
  const choices = (['LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'] as Role[]).filter((r) => r !== user.role);
  const form = useForm({ role: choices[0] as Role, departmentId: user.department?.id ?? '', staffId: user.staffId ?? '' });
  const target = form.values.role;
  const needsStaffId = target === 'LECTURER' && !user.staffId;

  const save = useMutation({
    mutationFn: () =>
      api.post(`/users/${user.id}/role`, {
        role: target,
        ...(target !== 'SUPER_ADMIN' && form.values.departmentId ? { departmentId: form.values.departmentId } : {}),
        ...(needsStaffId ? { staffId: form.values.staffId } : {}),
      }),
    onSuccess: () => {
      toast.success('Role changed', `${user.name} is now a ${ROLE_LABEL[target].toLowerCase()}. They have been signed out.`);
      invalidateUsers(queryClient);
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t change role', errorMessage(err));
    },
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Change role for ${user.name}`}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Change role
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-ink-2">
        Currently <strong>{ROLE_LABEL[user.role]}</strong>
        {user.department ? ` in ${user.department.name}` : ''}. Changing the role signs them out so the new permissions apply at their next sign-in.
      </p>
      <SelectField label="New role" required value={target} onChange={(e) => form.set('role', e.target.value as Role)} error={form.errors.role}>
        {choices.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </SelectField>
      {target !== 'SUPER_ADMIN' && (
        <SelectField label="Department" required {...form.bind('departmentId')}>
          <option value="">Choose a department</option>
          {options.data?.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
      )}
      {needsStaffId && <TextField label="Staff ID" required placeholder="STF/CSC/013" help="Needed to create their lecturer profile." {...form.bind('staffId')} />}
    </Drawer>
  );
}

// Page ------------------------------------------------------------------------

type StatusAction = { user: UserRow; status: AccountStatus };

const STATUS_COPY: Record<AccountStatus, { verb: string; done: string; confirm: string; message: (name: string) => React.ReactNode }> = {
  ACTIVE: {
    verb: 'Activate',
    done: 'Activated',
    confirm: 'Activate account',
    message: (name) => `${name} will be able to sign in again.`,
  },
  INACTIVE: {
    verb: 'Deactivate',
    done: 'Deactivated',
    confirm: 'Deactivate account',
    message: (name) => (
      <>
        {name} will be <strong>signed out immediately</strong> and will see “Your account is inactive” until it is reactivated.
      </>
    ),
  },
  SUSPENDED: {
    verb: 'Suspend',
    done: 'Suspended',
    confirm: 'Suspend user',
    message: () => (
      <>
        Suspending <strong>signs them out immediately</strong> on every device. They’ll see “Your account has been suspended. Contact the registry.” until you
        reactivate the account.
      </>
    ),
  },
};

export function UsersPage() {
  const { user: me } = useAdminScope();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<Role | ''>('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [changingRole, setChangingRole] = useState<UserRow | null>(null);
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null);
  const [password, setPassword] = useState<{ title: string; name: string; value: string } | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  useEffect(() => setPage(1), [role, departmentId, status, q]);

  const query = useQuery({
    queryKey: ['users', { role, departmentId, status, q, page }],
    queryFn: () => api.get<UsersResponse>('/users', { role, departmentId, status, q, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  const counts = query.data?.roleCounts ?? {};
  const totalCount = ROLES.reduce((sum, r) => sum + (counts[r] ?? 0), 0);

  const changeStatus = useMutation({
    mutationFn: ({ user, status: next, reason }: StatusAction & { reason: string }) => api.post(`/users/${user.id}/status`, { status: next, reason: reason || null }),
    onSuccess: (_d, { user, status: next }) => {
      toast.success(`${STATUS_COPY[next].done} ${user.name}`, next === 'ACTIVE' ? 'They can sign in again.' : 'Their sessions have been ended.');
      invalidateUsers(queryClient);
      setStatusAction(null);
    },
    onError: (err) => toast.error('Couldn’t change account status', errorMessage(err)),
  });

  const resetPassword = useMutation({
    mutationFn: (user: UserRow) => api.post<{ tempPassword: string }>(`/users/${user.id}/reset-password`),
    onSuccess: (data, user) => {
      setResetting(null);
      setPassword({ title: 'Password reset', name: user.name, value: data.tempPassword });
    },
    onError: (err) => toast.error('Couldn’t reset password', errorMessage(err)),
  });

  const menuFor = (u: UserRow): MenuItem[] => {
    const self = u.id === me.id;
    const items: MenuItem[] = [{ label: 'Edit', onSelect: () => setEditing(u) }];
    if (isStaff(u.role) && !self) items.push({ label: 'Change role', onSelect: () => setChangingRole(u) });
    items.push({ label: 'Reset password', onSelect: () => setResetting(u) });
    if (!self) {
      const statusItems: MenuItem[] = [];
      if (u.status !== 'ACTIVE') statusItems.push({ label: 'Activate', onSelect: () => setStatusAction({ user: u, status: 'ACTIVE' }) });
      if (u.status !== 'INACTIVE') statusItems.push({ label: 'Deactivate', onSelect: () => setStatusAction({ user: u, status: 'INACTIVE' }) });
      if (u.status !== 'SUSPENDED') statusItems.push({ label: 'Suspend…', danger: true, onSelect: () => setStatusAction({ user: u, status: 'SUSPENDED' }) });
      if (statusItems.length) statusItems[0].separatorBefore = true;
      items.push(...statusItems);
    }
    return items;
  };

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div className="flex flex-col">
          <span className="font-semibold">{u.name}</span>
          {(u.matricNo || u.staffId) && <span className="num text-xs text-muted">{u.matricNo ?? u.staffId}</span>}
        </div>
      ),
    },
    { key: 'email', header: 'Email', className: 'text-muted', render: (u) => u.email },
    { key: 'role', header: 'Role', render: (u) => ROLE_LABEL[u.role] },
    { key: 'department', header: 'Department', render: (u) => u.department?.name ?? <span className="text-muted">—</span> },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'last', header: 'Last login', className: 'num text-ink-2', render: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-muted">Never</span>) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (u) => <RowMenu label={`Actions for ${u.name}`} items={menuFor(u)} />,
    },
  ];

  const filtered = role || departmentId || status || q;

  return (
    <>
      <PageHeader
        title="Users"
        description="Every account in UEMP. Choose a role first when creating a user."
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            Create user
          </Button>
        }
      />

      <div role="tablist" aria-label="Filter by role" className="flex gap-6 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const selected = role === t.value;
          const n = t.value ? (counts[t.value] ?? 0) : totalCount;
          return (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setRole(t.value)}
              className={cx(
                'inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent px-1 text-sm font-semibold whitespace-nowrap',
                selected ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
              <span className="num rounded-full bg-[#EEF1EF] px-[7px] py-px text-xs font-semibold text-ink-2">{query.data ? n : '…'}</span>
            </button>
          );
        })}
      </div>

      <DataTable
        caption="Users"
        columns={columns}
        rows={query.data?.items}
        rowKey={(u) => u.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        toolbar={
          <>
            <SearchInput label="Search users" placeholder="Search name, email, matric or staff ID" value={search} onChange={setSearch} />
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
            <FilterSelect label="Status" value={status} onChange={setStatus}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </FilterSelect>
          </>
        }
        empty={
          <EmptyState
            icon={UsersIcon}
            tone="muted"
            message={filtered ? 'No users match these filters.' : 'No users yet.'}
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRole('');
                    setDepartmentId('');
                    setStatus('');
                    setSearch('');
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        }
        footer={query.data && <Pagination page={page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} noun="users" />}
      />

      <CreateUserDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name, value) => setPassword({ title: 'User created', name, value })}
      />
      {editing && <EditUserDrawer key={editing.id} user={editing} open onClose={() => setEditing(null)} />}
      {changingRole && <ChangeRoleDrawer key={changingRole.id} user={changingRole} open onClose={() => setChangingRole(null)} />}

      <ConfirmDialog
        open={!!statusAction}
        onClose={() => setStatusAction(null)}
        onConfirm={(reason) => {
          if (statusAction) changeStatus.mutate({ ...statusAction, reason });
        }}
        title={statusAction ? `${STATUS_COPY[statusAction.status].verb} ${statusAction.user.name}?` : ''}
        message={statusAction && STATUS_COPY[statusAction.status].message(statusAction.user.name)}
        confirmLabel={statusAction ? STATUS_COPY[statusAction.status].confirm : 'Confirm'}
        danger={statusAction?.status !== 'ACTIVE'}
        loading={changeStatus.isPending}
        comment={{ label: 'Reason', multiline: false, placeholder: 'Visible in the audit log' }}
      />

      <ConfirmDialog
        open={!!resetting}
        onClose={() => setResetting(null)}
        onConfirm={() => {
          if (resetting) resetPassword.mutate(resetting);
        }}
        title={`Reset password for ${resetting?.name ?? 'user'}?`}
        message="A new temporary password will be generated and shown once. Their current password stops working and they are signed out everywhere."
        confirmLabel="Reset password"
        loading={resetPassword.isPending}
      />

      <TempPasswordDialog
        open={!!password}
        onClose={() => setPassword(null)}
        title={password?.title ?? ''}
        name={password?.name ?? ''}
        password={password?.value ?? ''}
      />
    </>
  );
}
