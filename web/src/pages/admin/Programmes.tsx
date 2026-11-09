import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Layers, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { DeptRef } from '../../lib/types';
import { DepartmentFilter, useAdminScope, useOptions } from '../../components/shared';
import { Button, EmptyState, PageHeader } from '../../components/ui/primitives';
import { SearchInput, SelectField, TextField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Drawer } from '../../components/ui/overlay';
import { DataTable, type Column } from '../../components/ui/table';
import { useToast } from '../../components/ui/toast';
import { applyDuplicateError, RowMenu } from './Students';

export type ProgrammeRow = {
  id: string;
  code: string;
  name: string;
  label: string;
  award: string;
  durationYears: number;
  students: number;
  courses?: number;
  department: DeptRef;
};

const AWARDS = ['B.Sc.', 'B.Eng.', 'B.Tech.', 'B.A.', 'B.Ed.', 'LL.B.'];

export function ProgrammeFormDrawer({ programme, onClose }: { programme: ProgrammeRow | null; onClose: () => void }) {
  const { isSuper, departmentName } = useAdminScope();
  const options = useOptions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm({
    name: programme?.name ?? '',
    code: programme?.code ?? '',
    award: programme?.award ?? 'B.Sc.',
    durationYears: String(programme?.durationYears ?? 4),
    departmentId: programme?.department.id ?? '',
  });

  const save = useMutation({
    mutationFn: () => {
      const v = form.values;
      const body = {
        name: v.name,
        code: v.code,
        award: v.award,
        durationYears: Number(v.durationYears),
        ...(isSuper ? { departmentId: v.departmentId || undefined } : {}),
      };
      return programme ? api.patch(`/programs/${programme.id}`, body) : api.post('/programs', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['program'] });
      queryClient.invalidateQueries({ queryKey: ['options'] });
      toast.success(programme ? 'Programme updated' : 'Programme created', `${form.values.award} ${form.values.name}`);
      onClose();
    },
    onError: (err) => {
      if (form.applyError(err) || applyDuplicateError(err, form.setErrors, { code: 'This programme code', name: 'This programme name' })) return;
      toast.error(programme ? 'Couldn’t update programme' : 'Couldn’t create programme', errorMessage(err));
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
      title={programme ? `Edit ${programme.label}` : 'Add programme'}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {programme ? 'Save changes' : 'Create programme'}
          </Button>
        </>
      }
    >
      {!isSuper && <p className="m-0 -mt-1 text-[13px] text-muted">{departmentName} department</p>}
      <TextField label="Programme name" required placeholder="Computer Science" {...form.bind('name')} />
      <TextField label="Code" required placeholder="BSC-CSC" {...form.bind('code')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField label="Award" required {...form.bind('award')}>
          {AWARDS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </SelectField>
        <SelectField label="Duration" required help="Sets the highest level, e.g. 4 years → 400 Level" {...form.bind('durationYears')}>
          {[1, 2, 3, 4, 5, 6].map((y) => (
            <option key={y} value={y}>
              {y} {y === 1 ? 'year' : 'years'}
            </option>
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
    </Drawer>
  );
}

export function ProgrammesPage() {
  const { base, isSuper, departmentName } = useAdminScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const list = useQuery({
    queryKey: ['programs', { departmentId }],
    queryFn: () => api.get<{ items: ProgrammeRow[] }>('/programs', { departmentId }),
  });

  const [editing, setEditing] = useState<ProgrammeRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ProgrammeRow | null>(null);
  const remove = useMutation({
    mutationFn: (p: ProgrammeRow) => api.delete(`/programs/${p.id}`),
    onSuccess: (_d, p) => {
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['options'] });
      toast.success('Programme deleted', p.label);
    },
    onError: (err) => {
      setDeleting(null);
      toast.error('Couldn’t delete programme', errorMessage(err));
    },
  });

  const term = q.trim().toLowerCase();
  const rows = list.data?.items.filter((p) => !term || p.label.toLowerCase().includes(term) || p.code.toLowerCase().includes(term));

  const columns: Column<ProgrammeRow>[] = [
    { key: 'code', header: 'Code', render: (p) => <span className="num font-medium">{p.code}</span>, sortValue: (p) => p.code },
    {
      key: 'name',
      header: 'Programme',
      render: (p) => (
        <Link to={`${base}/programmes/${p.id}`} className="font-medium text-ink! hover:underline" onClick={(e) => e.stopPropagation()}>
          {p.label}
        </Link>
      ),
      sortValue: (p) => p.label,
    },
    { key: 'award', header: 'Award', render: (p) => p.award },
    { key: 'duration', header: 'Duration', render: (p) => `${p.durationYears} years`, sortValue: (p) => p.durationYears },
    ...(isSuper ? [{ key: 'dept', header: 'Dept', render: (p: ProgrammeRow) => p.department.code }] : []),
    { key: 'courses', header: 'Courses', align: 'right', render: (p) => <span className="num">{p.courses ?? 0}</span>, sortValue: (p) => p.courses ?? 0 },
    { key: 'students', header: 'Students', align: 'right', render: (p) => <span className="num">{p.students}</span>, sortValue: (p) => p.students },
    {
      key: 'actions',
      header: (
        <span className="relative">
          <span className="sr-only">Actions</span>
        </span>
      ),
      align: 'right',
      render: (p) => (
        <RowMenu
          label={`Actions for ${p.label}`}
          actions={[
            { label: 'View curriculum', icon: Eye, onSelect: () => navigate(`${base}/programmes/${p.id}`) },
            { label: 'Edit', icon: Pencil, onSelect: () => setEditing(p) },
            { label: p.students ? 'Delete (has students)' : 'Delete', icon: Trash2, danger: true, disabled: p.students > 0, onSelect: () => setDeleting(p) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Programmes"
        description={isSuper ? 'Degree programmes across the university, with their curricula.' : `Degree programmes run by ${departmentName}, with their curricula.`}
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add programme
          </Button>
        }
      />

      <DataTable
        caption="Programmes"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        onRowClick={(p) => navigate(`${base}/programmes/${p.id}`)}
        toolbar={
          <>
            <SearchInput label="Search programmes" placeholder="Search name or code" value={q} onChange={setQ} />
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
            {rows && <span className="num ml-auto text-[13px] text-muted">{rows.length} programmes</span>}
          </>
        }
        empty={
          term ? (
            <EmptyState icon={Search} tone="muted" message={`No programmes match “${q.trim()}”.`} />
          ) : (
            <EmptyState icon={Layers} message="No programmes yet." action={<Button onClick={() => setEditing('new')}>Add programme</Button>} />
          )
        }
      />

      {editing && <ProgrammeFormDrawer key={editing === 'new' ? 'new' : editing.id} programme={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) remove.mutate(deleting); }}
        title={`Delete ${deleting?.label ?? ''}?`}
        message="The programme and its curriculum are removed. Courses themselves are kept."
        confirmLabel="Delete programme"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
