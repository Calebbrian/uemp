import { useState } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, FileText, Gauge, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { DeptRef, Paged, ResultStatus, Semester, Term } from '../../lib/types';
import { DepartmentFilter, SemesterSelect, useAdminScope, useSemesters } from '../../components/shared';
import { Button, EmptyState, PageHeader, StatusBadge } from '../../components/ui/primitives';
import { Checkbox, SearchInput, SelectField, TextField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Dialog, Drawer } from '../../components/ui/overlay';
import { DataTable, type Column } from '../../components/ui/table';
import { useToast } from '../../components/ui/toast';
import type { LecturerRow } from './Lecturers';
import { RowMenu, useDebounced } from './Students';

export type OfferingRow = {
  id: string;
  capacity: number | null;
  registered: number;
  status: ResultStatus;
  course: { id: string; code: string; title: string; units: number; level: number; term: Term; department: DeptRef };
  semester: Semester;
  lecturers: { id: string; name: string }[];
};

type OfferingList = { semester: Semester | null; items: OfferingRow[] };

type CourseOption = { id: string; code: string; title: string; units: number; level: number; term: Term; isActive: boolean; department: DeptRef };

function invalidateOfferings(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['offerings'] });
  queryClient.invalidateQueries({ queryKey: ['lecturers'] });
  queryClient.invalidateQueries({ queryKey: ['results'] });
}

function OfferCourseDrawer({ defaultSemesterId, onClose }: { defaultSemesterId: string; onClose: () => void }) {
  const { isSuper } = useAdminScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const semesters = useSemesters();
  const form = useForm({ semesterId: defaultSemesterId, courseId: '', capacity: '' });
  const semester = semesters.data?.items.find((s) => s.id === form.values.semesterId);

  const courses = useQuery({
    queryKey: ['courses', { active: 'true', pageSize: 200 }],
    queryFn: () => api.get<Paged<CourseOption>>('/courses', { active: 'true', pageSize: 200 }),
  });
  const offered = useQuery({
    queryKey: ['offerings', { semesterId: form.values.semesterId }],
    queryFn: () => api.get<OfferingList>('/offerings', { semesterId: form.values.semesterId }),
    enabled: !!form.values.semesterId,
  });

  const offeredIds = new Set(offered.data?.items.map((o) => o.course.id));
  const choices = (courses.data?.items ?? []).filter((c) => (!semester || c.term === semester.term) && !offeredIds.has(c.id));

  const create = useMutation({
    mutationFn: () =>
      api.post<{ offering: OfferingRow }>('/offerings', {
        courseId: form.values.courseId,
        semesterId: form.values.semesterId,
        capacity: form.values.capacity ? Number(form.values.capacity) : null,
      }),
    onSuccess: (data) => {
      invalidateOfferings(queryClient);
      toast.success('Course offered', `${data.offering.course.code} · ${data.offering.semester.label}`);
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t offer course', errorMessage(err));
    },
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title="Offer a course"
      onSubmit={() => {
        const errors: Record<string, string> = {};
        if (!form.values.semesterId) errors.semesterId = 'Choose a semester';
        if (!form.values.courseId) errors.courseId = 'Choose a course';
        if (Object.keys(errors).length) return form.setErrors(errors);
        create.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Offer course
          </Button>
        </>
      }
    >
      <SelectField label="Semester" required {...form.bind('semesterId')} onChange={(e) => form.setValues((v) => ({ ...v, semesterId: e.target.value, courseId: '' }))}>
        <option value="">Select a semester…</option>
        {semesters.data?.items.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.isCurrent ? ' (current)' : ''}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Course"
        required
        help={semester ? `Only active ${semester.term === 'FIRST' ? 'first' : 'second'} semester courses not already offered in ${semester.session.name}.` : undefined}
        {...form.bind('courseId')}
      >
        <option value="">{courses.isPending ? 'Loading courses…' : choices.length ? 'Select a course…' : 'No courses left to offer'}</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} · {c.title} ({c.level}L, {c.units} units){isSuper ? ` — ${c.department.code}` : ''}
          </option>
        ))}
      </SelectField>
      <TextField label="Capacity" type="number" min={1} inputMode="numeric" placeholder="No limit" help="Leave empty for no limit." {...form.bind('capacity')} />
    </Drawer>
  );
}

function AssignLecturersDrawer({ offering, onClose }: { offering: OfferingRow; onClose: () => void }) {
  const { isSuper } = useAdminScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(offering.lecturers.map((l) => l.id)));
  const params = { pageSize: 200, status: 'ACTIVE', departmentId: isSuper ? offering.course.department.id : '' };
  const lecturers = useQuery({
    queryKey: ['lecturers', params],
    queryFn: () => api.get<Paged<LecturerRow>>('/lecturers', params),
  });

  const save = useMutation({
    mutationFn: () => api.put(`/offerings/${offering.id}/lecturers`, { lecturerIds: [...selected] }),
    onSuccess: () => {
      invalidateOfferings(queryClient);
      toast.success('Lecturers assigned', `${offering.course.code}: ${selected.size ? `${selected.size} lecturer${selected.size === 1 ? '' : 's'}` : 'no lecturers'}`);
      onClose();
    },
    onError: (err) => toast.error('Couldn’t assign lecturers', errorMessage(err)),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Assign lecturers · ${offering.course.code}`}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save assignment
          </Button>
        </>
      }
    >
      <p className="m-0 -mt-1 text-[13px] text-muted">
        {offering.course.title} · {offering.semester.label}. Only active lecturers in {offering.course.department.name} can be assigned.
      </p>
      {lecturers.isPending ? (
        <p className="m-0 text-sm text-muted">Loading lecturers…</p>
      ) : lecturers.error ? (
        <p className="m-0 text-sm text-danger-ink">{lecturers.error.message}</p>
      ) : lecturers.data.items.length === 0 ? (
        <p className="m-0 text-sm text-muted">No active lecturers in this department yet.</p>
      ) : (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only">Lecturers</legend>
          {lecturers.data.items.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-50">
              <Checkbox label={<span className="font-medium text-ink">{l.name}</span>} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
              <span className="text-right text-xs text-muted">
                {l.rank ?? l.staffId}
                <br />
                {l.currentCourses.length ? l.currentCourses.join(', ') : 'No courses this semester'}
              </span>
            </div>
          ))}
        </fieldset>
      )}
      <p className="m-0 text-[13px] text-muted num">{selected.size} selected</p>
    </Drawer>
  );
}

function CapacityDialog({ offering, onClose }: { offering: OfferingRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm({ capacity: offering.capacity === null ? '' : String(offering.capacity) });
  const save = useMutation({
    mutationFn: () => api.patch(`/offerings/${offering.id}`, { capacity: form.values.capacity ? Number(form.values.capacity) : null }),
    onSuccess: () => {
      invalidateOfferings(queryClient);
      toast.success('Capacity updated', `${offering.course.code}: ${form.values.capacity || 'no limit'}`);
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) form.setErrors({ capacity: errorMessage(err) });
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Capacity for ${offering.course.code}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0">
          <span className="num">{offering.registered}</span> students are registered. Capacity cannot be lower than that.
        </p>
        <TextField label="Capacity" type="number" min={Math.max(1, offering.registered)} inputMode="numeric" placeholder="No limit" help="Leave empty for no limit." {...form.bind('capacity')} />
      </div>
    </Dialog>
  );
}

export function OfferingsPage() {
  const { base, isSuper, departmentName } = useAdminScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const semesters = useSemesters();
  const [semesterId, setSemesterId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());

  const params = { semesterId, departmentId, q: search };
  const list = useQuery({
    queryKey: ['offerings', params],
    queryFn: () => api.get<OfferingList>('/offerings', params),
    placeholderData: keepPreviousData,
  });

  const [offering, setOffering] = useState(false);
  const [assigning, setAssigning] = useState<OfferingRow | null>(null);
  const [capacity, setCapacity] = useState<OfferingRow | null>(null);
  const [removing, setRemoving] = useState<OfferingRow | null>(null);

  const remove = useMutation({
    mutationFn: (o: OfferingRow) => api.delete(`/offerings/${o.id}`),
    onSuccess: (_d, o) => {
      setRemoving(null);
      invalidateOfferings(queryClient);
      toast.success('Offering removed', `${o.course.code} · ${o.semester.label}`);
    },
    onError: (err) => {
      setRemoving(null);
      toast.error('Couldn’t remove offering', errorMessage(err));
    },
  });

  const viewing = list.data?.semester;
  const currentId = semesters.data?.items.find((s) => s.isCurrent)?.id ?? '';
  const items = list.data?.items;
  const unassigned = items?.filter((o) => o.lecturers.length === 0).length ?? 0;

  const columns: Column<OfferingRow>[] = [
    {
      key: 'course',
      header: 'Course',
      render: (o) => (
        <span className="flex flex-col">
          <span className="font-semibold">{o.course.code}</span>
          <span className="text-[13px] text-muted">{o.course.title}</span>
        </span>
      ),
      sortValue: (o) => o.course.code,
    },
    { key: 'units', header: 'Units', align: 'right', render: (o) => <span className="num">{o.course.units}</span> },
    { key: 'level', header: 'Level', render: (o) => <span className="num">{o.course.level}</span>, sortValue: (o) => o.course.level },
    ...(isSuper ? [{ key: 'dept', header: 'Dept', render: (o: OfferingRow) => o.course.department.code }] : []),
    {
      key: 'lecturers',
      header: 'Lecturers',
      render: (o) =>
        o.lecturers.length ? (
          <span className="flex flex-col">
            {o.lecturers.map((l) => (
              <span key={l.id}>{l.name}</span>
            ))}
          </span>
        ) : (
          <button type="button" onClick={(e) => (e.stopPropagation(), setAssigning(o))} className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-sub-fg underline">
            Not assigned
          </button>
        ),
    },
    {
      key: 'registered',
      header: 'Registered',
      align: 'right',
      render: (o) => (
        <span className="num">
          {o.registered}
          <span className="text-muted"> / {o.capacity ?? '∞'}</span>
        </span>
      ),
      sortValue: (o) => o.registered,
    },
    { key: 'status', header: 'Result', render: (o) => <StatusBadge status={o.status} />, sortValue: (o) => o.status },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (o) => (
        <RowMenu
          label={`Actions for ${o.course.code}`}
          actions={[
            { label: 'Assign lecturers', icon: UserPlus, onSelect: () => setAssigning(o) },
            { label: 'Set capacity', icon: Gauge, onSelect: () => setCapacity(o) },
            { label: 'View result sheet', icon: FileText, onSelect: () => navigate(`${base}/results/${o.id}`) },
            {
              label: o.registered ? 'Remove (has registrations)' : 'Remove offering',
              icon: Trash2,
              danger: true,
              disabled: o.registered > 0,
              onSelect: () => setRemoving(o),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Course Offerings"
        description={`Which ${isSuper ? '' : `${departmentName} `}courses run in a semester, and who teaches them.`}
        actions={
          <Button icon={Plus} onClick={() => setOffering(true)}>
            Offer a course
          </Button>
        }
      />

      <DataTable
        caption="Course offerings"
        columns={columns}
        rows={items}
        rowKey={(o) => o.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        toolbar={
          <>
            <SearchInput label="Search offerings" placeholder="Search code or title" value={q} onChange={setQ} />
            <SemesterSelect value={semesterId} onChange={setSemesterId} />
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
            {items && (
              <span className="num ml-auto text-[13px] text-muted">
                {items.length} courses{unassigned ? ` · ${unassigned} without a lecturer` : ''}
              </span>
            )}
          </>
        }
        empty={
          search ? (
            <EmptyState icon={Search} tone="muted" message={`No offerings match “${search}”.`} />
          ) : (
            <EmptyState
              icon={CalendarCheck}
              message={`No courses offered${viewing ? ` in ${viewing.label}` : ''} yet.`}
              action={<Button onClick={() => setOffering(true)}>Offer a course</Button>}
            />
          )
        }
      />

      {offering && <OfferCourseDrawer defaultSemesterId={semesterId || viewing?.id || currentId} onClose={() => setOffering(false)} />}
      {assigning && <AssignLecturersDrawer key={assigning.id} offering={assigning} onClose={() => setAssigning(null)} />}
      {capacity && <CapacityDialog key={capacity.id} offering={capacity} onClose={() => setCapacity(null)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => { if (removing) remove.mutate(removing); }}
        title={`Remove ${removing?.course.code ?? ''} from ${removing?.semester.label ?? ''}?`}
        message="The course will no longer be available for registration this semester."
        confirmLabel="Remove offering"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
