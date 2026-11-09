import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { plural } from '../../lib/format';
import { Button, EmptyState, IconButton, PageHeader } from '../../components/ui/primitives';
import { TextField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Drawer } from '../../components/ui/overlay';
import { DataTable, type Column } from '../../components/ui/table';
import { useToast } from '../../components/ui/toast';

type Faculty = { id: string; code: string; name: string; departments: number; students: number };

function FacultyDrawer({ faculty, open, onClose }: { faculty: Faculty | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({ name: faculty?.name ?? '', code: faculty?.code ?? '' });

  const save = useMutation({
    mutationFn: () =>
      faculty ? api.patch(`/faculties/${faculty.id}`, form.values) : api.post('/faculties', form.values),
    onSuccess: () => {
      toast.success(faculty ? 'Faculty updated' : 'Faculty created', form.values.name);
      queryClient.invalidateQueries({ queryKey: ['faculties'] });
      queryClient.invalidateQueries({ queryKey: ['options'] });
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t save faculty', errorMessage(err));
    },
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={faculty ? `Edit ${faculty.name}` : 'Add faculty'}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {faculty ? 'Save changes' : 'Create faculty'}
          </Button>
        </>
      }
    >
      <TextField label="Name" required placeholder="Faculty of Science" {...form.bind('name')} />
      <TextField label="Code" required placeholder="SCI" help="2–6 letters, used in reports." {...form.bind('code')} />
    </Drawer>
  );
}

export function FacultiesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Faculty | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['faculties'],
    queryFn: () => api.get<{ items: Faculty[] }>('/faculties'),
  });

  const remove = useMutation({
    mutationFn: (f: Faculty) => api.delete(`/faculties/${f.id}`),
    onSuccess: (_d, f) => {
      toast.success('Faculty deleted', f.name);
      queryClient.invalidateQueries({ queryKey: ['faculties'] });
      queryClient.invalidateQueries({ queryKey: ['options'] });
      setDeleting(null);
    },
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : errorMessage(err)),
  });

  const openDrawer = (f: Faculty | null) => {
    setEditing(f);
    setDrawerOpen(true);
  };

  const columns: Column<Faculty>[] = [
    { key: 'code', header: 'Code', render: (f) => <span className="font-semibold">{f.code}</span>, sortValue: (f) => f.code },
    { key: 'name', header: 'Name', render: (f) => f.name, sortValue: (f) => f.name },
    { key: 'departments', header: 'Departments', align: 'right', className: 'num', render: (f) => f.departments, sortValue: (f) => f.departments },
    { key: 'students', header: 'Students', align: 'right', className: 'num', render: (f) => f.students, sortValue: (f) => f.students },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (f) => (
        <div className="flex justify-end gap-1">
          <IconButton label={`Edit ${f.name}`} icon={Pencil} onClick={() => openDrawer(f)} />
          <IconButton
            label={`Delete ${f.name}`}
            icon={Trash2}
            onClick={() => {
              setDeleteError(null);
              setDeleting(f);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Faculties"
        description="The top level of the university structure. Each department belongs to one faculty."
        actions={
          <Button icon={Plus} onClick={() => openDrawer(null)}>
            Add faculty
          </Button>
        }
      />
      <DataTable
        caption="Faculties"
        columns={columns}
        rows={query.data?.items}
        rowKey={(f) => f.id}
        loading={query.isPending}
        error={query.error}
        onRetry={() => query.refetch()}
        empty={
          <EmptyState
            icon={Building2}
            message="No faculties yet."
            action={
              <Button icon={Plus} onClick={() => openDrawer(null)}>
                Add faculty
              </Button>
            }
          />
        }
        footer={
          query.data && (
            <div className="num px-4 py-3 text-[13px] text-muted">{plural(query.data.items.length, 'faculty', 'faculties')}</div>
          )
        }
      />
      <FacultyDrawer key={editing?.id ?? 'new'} faculty={editing} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
        title={`Delete ${deleting?.name ?? 'faculty'}?`}
        message="This cannot be undone. A faculty can only be deleted once it has no departments."
        confirmLabel="Delete faculty"
        danger
        loading={remove.isPending}
        error={deleteError}
      />
    </>
  );
}
