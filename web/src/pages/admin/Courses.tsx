import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { levelLabel } from '../../lib/format';
import type { DeptRef, Paged, Term } from '../../lib/types';
import { DepartmentFilter, LEVELS, useAdminScope, useOptions } from '../../components/shared';
import { Badge, Button, EmptyState, PageHeader, Tag } from '../../components/ui/primitives';
import { Checkbox, FilterSelect, SearchInput, SelectField, TextAreaField, TextField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Drawer } from '../../components/ui/overlay';
import { DataTable, Pagination, type Column } from '../../components/ui/table';
import { useToast } from '../../components/ui/toast';
import { applyDuplicateError, RowMenu, useDebounced } from './Students';

type CourseRow = {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  term: Term;
  description: string | null;
  isActive: boolean;
  offerings: number;
  department: DeptRef;
  programs: { id: string; code: string; isCore: boolean }[];
};

const TERM_LABEL: Record<Term, string> = { FIRST: 'First', SECOND: 'Second' };

function CourseFormDrawer({ course, onClose }: { course: CourseRow | null; onClose: () => void }) {
  const { isSuper, departmentName } = useAdminScope();
  const options = useOptions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isActive, setIsActive] = useState(course?.isActive ?? true);
  const form = useForm({
    code: course?.code ?? '',
    title: course?.title ?? '',
    units: String(course?.units ?? 3),
    level: String(course?.level ?? 100),
    term: course?.term ?? 'FIRST',
    description: course?.description ?? '',
    departmentId: course?.department.id ?? '',
  });

  const save = useMutation({
    mutationFn: () => {
      const v = form.values;
      const body = {
        code: v.code,
        title: v.title,
        units: Number(v.units),
        level: Number(v.level),
        term: v.term,
        description: v.description || null,
        isActive,
        ...(isSuper ? { departmentId: v.departmentId || undefined } : {}),
      };
      return course
        ? api.patch<{ course: { code: string; title: string } }>(`/courses/${course.id}`, body)
        : api.post<{ course: { code: string; title: string } }>('/courses', body);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(course ? 'Course updated' : 'Course created', `${data.course.code} · ${data.course.title}`);
      onClose();
    },
    onError: (err) => {
      if (form.applyError(err) || applyDuplicateError(err, form.setErrors, { code: 'This course code' })) return;
      toast.error(course ? 'Couldn’t update course' : 'Couldn’t create course', errorMessage(err));
    },
  });

  const submit = () => {
    if (isSuper && !form.values.departmentId) {
      form.setErrors({ departmentId: 'Choose a department' });
      return;
    }
    save.mutate();
  };

  const locked = !!course && course.offerings > 0;

  return (
    <Drawer
      open
      onClose={onClose}
      title={course ? `Edit ${course.code}` : 'Add course'}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {course ? 'Save changes' : 'Create course'}
          </Button>
        </>
      }
    >
      {!isSuper && <p className="m-0 -mt-1 text-[13px] text-muted">{departmentName} department</p>}
      <TextField label="Course code" required placeholder="CSC 201" {...form.bind('code')} />
      <TextField label="Title" required {...form.bind('title')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField label="Units" required {...form.bind('units')}>
          {[1, 2, 3, 4, 5, 6].map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </SelectField>
        <SelectField label="Level" required disabled={locked} {...form.bind('level')}>
          {[...LEVELS, 600].map((l) => (
            <option key={l} value={l}>
              {levelLabel(l)}
            </option>
          ))}
        </SelectField>
        <SelectField label="Semester" required disabled={locked} {...form.bind('term')}>
          <option value="FIRST">First</option>
          <option value="SECOND">Second</option>
        </SelectField>
      </div>
      {locked && <p className="m-0 -mt-1.5 text-xs text-muted">Level and semester are fixed because this course has already been offered.</p>}
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
      <TextAreaField label="Description" {...form.bind('description')} />
      <Checkbox label="Active (can be offered and registered)" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
    </Drawer>
  );
}

export function CoursesPage() {
  const { isSuper, departmentName } = useAdminScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [term, setTerm] = useState('');
  const [active, setActive] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());

  useEffect(() => setPage(1), [search, level, term, active, departmentId]);

  const params = { q: search, level, term, active, departmentId, page, pageSize: 25 };
  const list = useQuery({
    queryKey: ['courses', params],
    queryFn: () => api.get<Paged<CourseRow>>('/courses', params),
    placeholderData: keepPreviousData,
  });

  const [editing, setEditing] = useState<CourseRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CourseRow | null>(null);
  const remove = useMutation({
    mutationFn: (c: CourseRow) => api.delete(`/courses/${c.id}`),
    onSuccess: (_d, c) => {
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Course deleted', c.code);
    },
    onError: (err) => {
      setDeleting(null);
      toast.error('Couldn’t delete course', errorMessage(err));
    },
  });

  const filtered = !!(search || level || term || active || departmentId);

  const columns: Column<CourseRow>[] = [
    { key: 'code', header: 'Code', render: (c) => <span className="num font-semibold">{c.code}</span>, sortValue: (c) => c.code },
    { key: 'title', header: 'Title', render: (c) => c.title, sortValue: (c) => c.title },
    { key: 'units', header: 'Units', align: 'right', render: (c) => <span className="num">{c.units}</span>, sortValue: (c) => c.units },
    { key: 'level', header: 'Level', render: (c) => <span className="num">{c.level}</span>, sortValue: (c) => c.level },
    { key: 'term', header: 'Semester', render: (c) => TERM_LABEL[c.term], sortValue: (c) => c.term },
    ...(isSuper ? [{ key: 'dept', header: 'Dept', render: (c: CourseRow) => c.department.code }] : []),
    {
      key: 'programs',
      header: 'Programmes',
      render: (c) =>
        c.programs.length ? (
          <span className="flex flex-wrap gap-1.5">
            {c.programs.map((p) => (
              <Tag key={p.id} kind={p.isCore ? 'core' : 'elective'}>
                {p.code}
                {p.isCore ? '' : ' · elective'}
              </Tag>
            ))}
          </span>
        ) : (
          <span className="text-muted">Not in a curriculum</span>
        ),
    },
    { key: 'active', header: 'Status', render: (c) => <Badge tone={c.isActive ? 'ok' : 'draft'}>{c.isActive ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'actions',
      header: (
        <span className="relative">
          <span className="sr-only">Actions</span>
        </span>
      ),
      align: 'right',
      render: (c) => (
        <RowMenu
          label={`Actions for ${c.code}`}
          actions={[
            { label: 'Edit', icon: Pencil, onSelect: () => setEditing(c) },
            { label: c.offerings ? 'Delete (already offered)' : 'Delete', icon: Trash2, danger: true, disabled: c.offerings > 0, onSelect: () => setDeleting(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Courses"
        description={isSuper ? 'Every course in the university catalogue.' : `Courses owned by ${departmentName}.`}
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add course
          </Button>
        }
      />

      <DataTable
        caption="Courses"
        columns={columns}
        rows={list.data?.items}
        rowKey={(c) => c.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => list.refetch()}
        toolbar={
          <>
            <SearchInput label="Search courses" placeholder="Search code or title" value={q} onChange={setQ} />
            <FilterSelect label="Level" value={level} onChange={setLevel}>
              <option value="">All levels</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {levelLabel(l)}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Semester" value={term} onChange={setTerm}>
              <option value="">Both semesters</option>
              <option value="FIRST">First semester</option>
              <option value="SECOND">Second semester</option>
            </FilterSelect>
            <FilterSelect label="Status" value={active} onChange={setActive}>
              <option value="">Active and inactive</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </FilterSelect>
            <DepartmentFilter value={departmentId} onChange={setDepartmentId} />
            {list.data && <span className="num ml-auto text-[13px] text-muted">{list.data.total} courses</span>}
          </>
        }
        empty={
          filtered ? (
            <EmptyState icon={Search} tone="muted" message="No courses match these filters." />
          ) : (
            <EmptyState icon={BookOpen} message="No courses yet." action={<Button onClick={() => setEditing('new')}>Add course</Button>} />
          )
        }
        footer={list.data && list.data.total > 0 && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} noun="courses" />}
      />

      {editing && <CourseFormDrawer key={editing === 'new' ? 'new' : editing.id} course={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) remove.mutate(deleting); }}
        title={`Delete ${deleting?.code ?? ''}?`}
        message="The course is removed from the catalogue and from every programme curriculum. This cannot be undone."
        confirmLabel="Delete course"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
