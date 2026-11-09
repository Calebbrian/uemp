import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, BookOpen, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { levelLabel, plural } from '../../lib/format';
import type { Term } from '../../lib/types';
import { useAdminScope } from '../../components/shared';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Tag } from '../../components/ui/primitives';
import { SearchInput, SelectField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Drawer } from '../../components/ui/overlay';
import { useToast } from '../../components/ui/toast';
import { ProgrammeFormDrawer, type ProgrammeRow } from './Programmes';
import { RowMenu } from './Students';

type CurriculumCourse = {
  courseId: string;
  code: string;
  title: string;
  units: number;
  level: number;
  term: Term;
  isCore: boolean;
  isActive: boolean;
  department: string;
};

type ProgrammeDetail = { program: ProgrammeRow; curriculum: CurriculumCourse[] };

type CatalogCourse = { id: string; code: string; title: string; units: number; level: number; term: Term; department: string };

const TERMS: { term: Term; label: string }[] = [
  { term: 'FIRST', label: 'First semester' },
  { term: 'SECOND', label: 'Second semester' },
];

const th = 'border-b border-line bg-subtle px-4 py-2.5 text-left text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';
const td = 'border-b border-line-soft px-4 py-2.5 whitespace-nowrap';

function AddCourseDrawer({ programme, existing, onClose }: { programme: ProgrammeRow; existing: Set<string>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const form = useForm({ courseId: '', isCore: 'core' });
  const catalog = useQuery({
    queryKey: ['course-catalog'],
    queryFn: () => api.get<{ items: CatalogCourse[] }>('/courses/catalog'),
  });

  const maxLevel = programme.durationYears * 100;
  const term = q.trim().toLowerCase();
  const choices = (catalog.data?.items ?? []).filter(
    (c) => !existing.has(c.id) && c.level <= maxLevel && (!term || c.code.toLowerCase().includes(term) || c.title.toLowerCase().includes(term)),
  );

  const add = useMutation({
    mutationFn: () => api.post(`/programs/${programme.id}/courses`, { courseId: form.values.courseId, isCore: form.values.isCore === 'core' }),
    onSuccess: () => {
      const course = catalog.data?.items.find((c) => c.id === form.values.courseId);
      queryClient.invalidateQueries({ queryKey: ['program', programme.id] });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      toast.success('Course added', `${course?.code ?? 'Course'} is now part of ${programme.label}`);
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t add course', errorMessage(err));
    },
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title="Add course to curriculum"
      onSubmit={() => {
        if (!form.values.courseId) {
          form.setErrors({ courseId: 'Choose a course' });
          return;
        }
        add.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending}>
            Add course
          </Button>
        </>
      }
    >
      <p className="m-0 -mt-1 text-[13px] text-muted">
        {programme.label} runs to {levelLabel(maxLevel)}. Courses from other departments can be added too.
      </p>
      <SearchInput label="Filter courses" placeholder="Filter by code or title" value={q} onChange={setQ} />
      <SelectField label="Course" required size={8} className="[&_select]:h-auto [&_select]:py-1" {...form.bind('courseId')}>
        {catalog.isPending && <option disabled>Loading courses…</option>}
        {!catalog.isPending && choices.length === 0 && <option disabled>No more courses to add</option>}
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} · {c.title} ({c.level}L, {c.term === 'FIRST' ? 'First' : 'Second'}, {c.units}u) — {c.department}
          </option>
        ))}
      </SelectField>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Type</legend>
        {[
          { value: 'core', label: 'Core', help: 'Every student on the programme takes it' },
          { value: 'elective', label: 'Elective', help: 'Students may choose it' },
        ].map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-50">
            <input type="radio" name="isCore" value={o.value} checked={form.values.isCore === o.value} onChange={() => form.set('isCore', o.value)} className="mt-0.5 accent-brand" />
            <span className="flex flex-col">
              <strong className="font-semibold">{o.label}</strong>
              <span className="text-[13px] text-muted">{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Drawer>
  );
}

export function ProgrammeDetailPage() {
  const { id = '' } = useParams();
  const { base } = useAdminScope();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CurriculumCourse | null>(null);
  const detail = useQuery({ queryKey: ['program', id], queryFn: () => api.get<ProgrammeDetail>(`/programs/${id}`) });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['program', id] });
    queryClient.invalidateQueries({ queryKey: ['programs'] });
    queryClient.invalidateQueries({ queryKey: ['courses'] });
  };

  const toggle = useMutation({
    mutationFn: (c: CurriculumCourse) => api.post(`/programs/${id}/courses`, { courseId: c.courseId, isCore: !c.isCore }),
    onSuccess: (_d, c) => {
      refresh();
      toast.success('Curriculum updated', `${c.code} is now ${c.isCore ? 'an elective' : 'core'}`);
    },
    onError: (err) => toast.error('Couldn’t update curriculum', errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (c: CurriculumCourse) => api.delete(`/programs/${id}/courses/${c.courseId}`),
    onSuccess: (_d, c) => {
      setRemoving(null);
      refresh();
      toast.success('Course removed', `${c.code} removed from the curriculum`);
    },
    onError: (err) => {
      setRemoving(null);
      toast.error('Couldn’t remove course', errorMessage(err));
    },
  });

  const existing = useMemo(() => new Set(detail.data?.curriculum.map((c) => c.courseId)), [detail.data]);

  if (detail.isPending) return <Spinner label="Loading programme" />;
  if (detail.error) {
    return (
      <>
        <PageHeader title="Programme" breadcrumb={[{ label: 'Programmes', to: `${base}/programmes` }, { label: 'Not available' }]} />
        <Card>
          <EmptyState icon={Layers} tone="danger" message={detail.error.message} />
        </Card>
      </>
    );
  }

  const { program, curriculum } = detail.data;
  const levels = Array.from({ length: program.durationYears }, (_, i) => (i + 1) * 100);
  const totalUnits = curriculum.reduce((sum, c) => sum + c.units, 0);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Programmes', to: `${base}/programmes` }, { label: program.label }]}
        title={program.label}
        description={`${program.code} · ${program.department.name} · ${program.durationYears} years · ${plural(program.students, 'student')}`}
        actions={
          <>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Edit programme
            </Button>
            <Button icon={Plus} onClick={() => setAdding(true)}>
              Add course
            </Button>
          </>
        }
      />

      <Card className="num flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-sm">
        <span>
          <span className="text-muted">Courses</span> <strong>{curriculum.length}</strong>
        </span>
        <span>
          <span className="text-muted">Core</span> <strong>{curriculum.filter((c) => c.isCore).length}</strong>
        </span>
        <span>
          <span className="text-muted">Electives</span> <strong>{curriculum.filter((c) => !c.isCore).length}</strong>
        </span>
        <span>
          <span className="text-muted">Total units</span> <strong>{totalUnits}</strong>
        </span>
      </Card>

      {levels.map((level) => (
        <section key={level} className="flex flex-col gap-3">
          <h2 className="m-0 text-lg font-semibold">{levelLabel(level)}</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {TERMS.map(({ term, label }) => {
              const courses = curriculum.filter((c) => c.level === level && c.term === term);
              const units = courses.reduce((sum, c) => sum + c.units, 0);
              return (
                <Card key={term} className="overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
                    <h3 className="m-0 text-sm font-semibold">{label}</h3>
                    <span className="num text-[13px] text-muted">
                      {plural(courses.length, 'course')} · {units} units
                    </span>
                  </div>
                  {courses.length === 0 ? (
                    <EmptyState icon={BookOpen} tone="muted" message="No courses yet." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr>
                            <th className={th}>Code</th>
                            <th className={th}>Title</th>
                            <th className={`${th} text-right`}>Units</th>
                            <th className={th}>Type</th>
                            <th className={th}>
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {courses.map((c) => (
                            <tr key={c.courseId} className="hover:[&>td]:bg-hover">
                              <td className={`${td} font-semibold`}>
                                {c.code}
                                {c.department !== program.department.code && <span className="ml-1.5 text-xs font-normal text-muted">({c.department})</span>}
                              </td>
                              <td className={td}>
                                {c.title}
                                {!c.isActive && (
                                  <span className="ml-2 align-middle">
                                    <Badge tone="draft">Inactive</Badge>
                                  </span>
                                )}
                              </td>
                              <td className={`${td} num text-right`}>{c.units}</td>
                              <td className={td}>
                                <Tag kind={c.isCore ? 'core' : 'elective'}>{c.isCore ? 'Core' : 'Elective'}</Tag>
                              </td>
                              <td className={`${td} text-right`}>
                                <RowMenu
                                  label={`Actions for ${c.code}`}
                                  actions={[
                                    { label: c.isCore ? 'Make elective' : 'Make core', icon: ArrowLeftRight, onSelect: () => toggle.mutate(c) },
                                    { label: 'Remove from curriculum', icon: Trash2, danger: true, onSelect: () => setRemoving(c) },
                                  ]}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {editing && <ProgrammeFormDrawer programme={program} onClose={() => setEditing(false)} />}
      {adding && <AddCourseDrawer programme={program} existing={existing} onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => { if (removing) remove.mutate(removing); }}
        title={`Remove ${removing?.code ?? ''} from the curriculum?`}
        message="Students on this programme will no longer see it when registering. Existing registrations and results are not affected."
        confirmLabel="Remove course"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
