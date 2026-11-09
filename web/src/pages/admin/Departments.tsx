import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { plural } from '../../lib/format';
import { Button, EmptyState, IconButton, PageHeader } from '../../components/ui/primitives';
import { FilterSelect, SelectField, TextField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Drawer } from '../../components/ui/overlay';
import { DataTable, type Column } from '../../components/ui/table';
import { useToast } from '../../components/ui/toast';
import { useOptions } from '../../components/shared';

type Department = {
  id: string;
  code: string;
  name: string;
  faculty: { id: string; code: string; name: string };
  students: number;
  lecturers: number;
  courses: number;
  programs: number;
  admins: { id: string; name: string; email: string }[];
};

function DepartmentDrawer({ department, open, onClose }: { department: Department | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const options = useOptions();
  const form = useForm({
    name: department?.name ?? '',
    code: department?.code ?? '',
    facultyId: department?.faculty.id ?? '',
  });

  const save = useMutation({
    mutationFn: () =>
      department ? api.patch(`/departments/${department.id}`, form.values) : api.post('/departments', form.values),
    onSuccess: () => {
      toast.success(department ? 'Department updated' : 'Department created', form.values.name);
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['faculties'] });
      queryClient.invalidateQueries({ queryKey: ['options'] });
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t save department', errorMessage(err));
    },
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={department ? `Edit ${department.name}` : 'Add department'}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {department ? 'Save changes' : 'Create department'}
          </Button>
        </>
      }
    >
      <TextField label="Name" required placeholder="Computer Science" {...form.bind('name')} />
      <TextField label="Code" required placeholder="CSC" help="2–6 letters. Used in matric numbers and course codes." {...form.bind('code')} />
      <SelectField label="Faculty" required {...form.bind('facultyId')}>
        <option value="">Choose a faculty</option>
        {options.data?.faculties.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </SelectField>
    </Drawer>
  );
}

export function DepartmentsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const options = useOptions();
  const [facultyId, setFacultyId] = useState('');
  const [editing, setEditing] = useState<Department | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['departments', facultyId],
    queryFn: () => api.get<{ items: Department[] }>('/departments', { facultyId }),
  });

  const remove = useMutation({
    mutationFn: (d: Department) => api.delete(`/departments/${d.id}`),
    onSuccess: (_r, d) => {
      toast.success('Department deleted', d.name);
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['faculties'] });
      queryClient.invalidateQueries({ queryKey: ['options'] });
      setDeleting(null);
    },
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : errorMessage(err)),
  });

  const openDrawer = (d: Department | null) => {
    setEditing(d);
    setDrawerOpen(true);
  };

  const columns: Column<Department>[] = [
    { key: 'code', header: 'Code', render: (d) => <span className="font-semibold">{d.code}</span>, sortValue: (d) => d.code },
    { key: 'name', header: 'Name', render: (d) => d.name, sortValue: (d) => d.name },
    { key: 'faculty', header: 'Faculty', render: (d) => d.faculty.name, sortValue: (d) => d.faculty.name },
    { key: 'students', header: 'Students', align: 'right', className: 'num', render: (d) => d.students, sortValue: (d) => d.students },
    { key: 'lecturers', header: 'Lecturers', align: 'right', className: 'num', render: (d) => d.lecturers, sortValue: (d) => d.lecturers },
    { key: 'courses', header: 'Courses', align: 'right', className: 'num', render: (d) => d.courses, sortValue: (d) => d.courses },
    {
      key: 'admin',
      header: 'Department admin',
      render: (d) =>
        d.admins.length ? (
          <span title={d.admins.map((a) => a.email).join(', ')}>{d.admins.map((a) => a.name).join(', ')}</span>
        ) : (
          <span className="text-muted">Not assigned</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (d) => (
        <div className="flex justify-end gap-1">
          <IconButton label={`Edit ${d.name}`} icon={Pencil} onClick={() => openDrawer(d)} />
          <IconButton
            label={`Delete ${d.name}`}
            icon={Trash2}
            onClick={() => {
              setDeleteError(null);
              setDeleting(d);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Departments"
        description="Departments own their programmes, courses, lecturers and students."
        actions={
          <Button icon={Plus} onClick={() => openDrawer(null)}>
            Add department
          </Button>
        }
      />
      <DataTable
        caption="Departments"
        columns={columns}
        rows={query.data?.items}
        rowKey={(d) => d.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        toolbar={
          <FilterSelect label="Faculty" value={facultyId} onChange={setFacultyId}>
            <option value="">All faculties</option>
            {options.data?.faculties.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </FilterSelect>
        }
        empty={<EmptyState icon={Network} message={facultyId ? 'No departments in this faculty yet.' : 'No departments yet.'} />}
        footer={
          query.data && (
            <div className="num px-4 py-3 text-[13px] text-muted">{plural(query.data.items.length, 'department')}</div>
          )
        }
      />
      <DepartmentDrawer key={editing?.id ?? 'new'} department={editing} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
        title={`Delete ${deleting?.name ?? 'department'}?`}
        message="This cannot be undone. Only empty departments with no history can be deleted."
        confirmLabel="Delete department"
        danger
        loading={remove.isPending}
        error={deleteError}
      />
    </>
  );
}
