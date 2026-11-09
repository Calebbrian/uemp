import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Pencil, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { formatDate, plural } from '../../lib/format';
import type { Term } from '../../lib/types';
import { Badge, Button, Card, cx, EmptyState, PageHeader, Skeleton } from '../../components/ui/primitives';
import { TextField, useForm } from '../../components/ui/form';
import { ConfirmDialog, Drawer } from '../../components/ui/overlay';
import { useToast } from '../../components/ui/toast';

type SessionSemester = {
  id: string;
  term: Term;
  label: string;
  isCurrent: boolean;
  registrationOpen: boolean;
  offerings: number;
  registrations: number;
};

type AcademicSession = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  semesters: SessionSemester[];
};

const toInputDate = (iso: string) => iso.slice(0, 10);

function suggestNextName(sessions: AcademicSession[] | undefined) {
  const latest = sessions?.[0]?.name;
  if (!latest) return '';
  const start = Number(latest.slice(0, 4)) + 1;
  return `${start}/${start + 1}`;
}

function SessionDrawer({
  session,
  open,
  onClose,
  suggestedName,
}: {
  session: AcademicSession | null;
  open: boolean;
  onClose: () => void;
  suggestedName: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
    name: session?.name ?? suggestedName,
    startDate: session ? toInputDate(session.startDate) : '',
    endDate: session ? toInputDate(session.endDate) : '',
  });

  const save = useMutation({
    mutationFn: () => (session ? api.patch(`/sessions/${session.id}`, form.values) : api.post('/sessions', form.values)),
    onSuccess: () => {
      toast.success(session ? 'Session updated' : 'Session created', session ? form.values.name : `${form.values.name} with first and second semesters`);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['semesters'] });
      queryClient.invalidateQueries({ queryKey: ['current-semester'] });
      onClose();
    },
    onError: (err) => {
      if (!form.applyError(err)) toast.error('Couldn’t save session', errorMessage(err));
    },
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={session ? `Edit ${session.name} session` : 'New academic session'}
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {session ? 'Save changes' : 'Create session'}
          </Button>
        </>
      }
    >
      <TextField label="Session name" required placeholder="2027/2028" help="Two consecutive years, e.g. 2027/2028." {...form.bind('name')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Start date" type="date" required {...form.bind('startDate')} />
        <TextField label="End date" type="date" required {...form.bind('endDate')} />
      </div>
      {!session && (
        <p className="m-0 text-[13px] text-muted">A first and second semester are created automatically. Neither becomes current until you set it.</p>
      )}
    </Drawer>
  );
}

function RegistrationSwitch({ semester, sessionName, onToggle, busy }: { semester: SessionSemester; sessionName: string; onToggle: () => void; busy: boolean }) {
  const disabled = !semester.isCurrent || busy;
  const text = semester.registrationOpen
    ? 'Registration open'
    : semester.isCurrent
      ? 'Registration closed'
      : 'Registration closed · not current';
  return (
    <div className="flex min-w-[250px] items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={semester.registrationOpen}
        aria-label={`Registration for ${sessionName} ${semester.label}`}
        disabled={disabled}
        onClick={onToggle}
        className={cx(
          'flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-0 p-0.5 transition-colors disabled:cursor-not-allowed',
          semester.registrationOpen ? 'justify-end bg-brand' : 'justify-start bg-faint',
          !semester.isCurrent && 'opacity-50',
        )}
      >
        <span className="size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)]" />
      </button>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

export function SessionsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<AcademicSession | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [makeCurrent, setMakeCurrent] = useState<{ semester: SessionSemester; session: AcademicSession } | null>(null);

  const query = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<{ items: AcademicSession[] }>('/sessions'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['semesters'] });
    queryClient.invalidateQueries({ queryKey: ['current-semester'] });
  };

  const setCurrent = useMutation({
    mutationFn: (semesterId: string) => api.post(`/sessions/semesters/${semesterId}/current`),
    onSuccess: () => {
      toast.success('Current semester changed', makeCurrent ? `${makeCurrent.session.name} · ${makeCurrent.semester.label}` : undefined);
      invalidate();
      setMakeCurrent(null);
    },
    onError: (err) => toast.error('Couldn’t change the current semester', errorMessage(err)),
  });

  const toggleRegistration = useMutation({
    mutationFn: (s: SessionSemester) => api.post(`/sessions/semesters/${s.id}/registration`, { open: !s.registrationOpen }),
    onSuccess: (_d, s) => {
      toast.success(s.registrationOpen ? 'Registration closed' : 'Registration opened', s.registrationOpen ? 'Students can no longer add or drop courses.' : 'Students can now register courses.');
      invalidate();
    },
    onError: (err) => toast.error('Couldn’t update registration', errorMessage(err)),
  });

  const isOpen = (s: AcademicSession, index: number) => expanded[s.id] ?? (s.isCurrent || (index === 0 && !query.data?.items.some((x) => x.isCurrent)));

  const openDrawer = (s: AcademicSession | null) => {
    setEditing(s);
    setDrawerOpen(true);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Sessions & Semesters"
        description="One semester is current at a time. Registration can only be open for the current semester."
        actions={
          <Button icon={Plus} onClick={() => openDrawer(null)}>
            New session
          </Button>
        }
      />

      <div className="flex max-w-[1040px] flex-col gap-4">
        {query.isPending &&
          [0, 1].map((i) => (
            <Card key={i} className="flex flex-col gap-2 px-5 py-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}

        {query.error && (
          <Card>
            <EmptyState
              icon={CalendarDays}
              tone="danger"
              message={errorMessage(query.error)}
              action={
                <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                  Try again
                </Button>
              }
            />
          </Card>
        )}

        {query.data?.items.length === 0 && (
          <Card>
            <EmptyState
              icon={CalendarDays}
              message="No academic sessions yet."
              action={
                <Button icon={Plus} onClick={() => openDrawer(null)}>
                  New session
                </Button>
              }
            />
          </Card>
        )}

        {query.data?.items.map((session, index) => {
          const open = isOpen(session, index);
          const complete = !session.isCurrent && toInputDate(session.endDate) < today;
          const upcoming = !session.isCurrent && toInputDate(session.startDate) > today;
          return (
            <Card key={session.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3.5 px-5 py-4">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded((e) => ({ ...e, [session.id]: !open }))}
                  className="flex flex-[1_1_220px] cursor-pointer items-center gap-3.5 border-0 bg-transparent p-0 text-left text-ink"
                >
                  <ChevronRight className={cx('size-[18px] shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[17px] font-semibold">{session.name} session</span>
                    <span className="num text-[13px] text-muted">
                      {formatDate(session.startDate)} – {formatDate(session.endDate)}
                    </span>
                  </span>
                </button>
                {session.isCurrent ? (
                  <Badge tone="ok">Current session</Badge>
                ) : complete ? (
                  <Badge tone="draft">Complete</Badge>
                ) : upcoming ? (
                  <Badge tone="info">Upcoming</Badge>
                ) : (
                  <Badge tone="draft">Not current</Badge>
                )}
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openDrawer(session)} aria-label={`Edit ${session.name} session`}>
                  Edit
                </Button>
              </div>
              {open && (
                <div className="border-t border-line">
                  {session.semesters.map((semester) => (
                    <div
                      key={semester.id}
                      className={cx(
                        'flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line-soft py-4 pr-5 pl-5 last:border-b-0 sm:pl-[52px]',
                        semester.isCurrent ? 'bg-[#F4FAF6]' : 'bg-white',
                      )}
                    >
                      <div className="flex flex-[1_1_220px] flex-col gap-0.5">
                        <div className="flex items-center gap-2.5">
                          <strong className="text-[15px]">{semester.label}</strong>
                          {semester.isCurrent && (
                            <span className="inline-flex h-6 items-center rounded-full bg-brand px-[9px] text-xs font-semibold text-white">Current</span>
                          )}
                        </div>
                        <span className="num text-[13px] text-muted">
                          {plural(semester.offerings, 'course')} offered · {plural(semester.registrations, 'registration')}
                        </span>
                      </div>
                      <RegistrationSwitch
                        semester={semester}
                        sessionName={session.name}
                        busy={toggleRegistration.isPending && toggleRegistration.variables?.id === semester.id}
                        onToggle={() => toggleRegistration.mutate(semester)}
                      />
                      <div className="flex w-[140px] justify-end">
                        {!semester.isCurrent && !complete && (
                          <Button variant="secondary" size="sm" onClick={() => setMakeCurrent({ semester, session })}>
                            Set as current
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}

        <p className="m-0 text-[13px] text-muted">
          Changing the current semester or registration status is recorded in the audit log and takes effect for all users immediately.
        </p>
      </div>

      <SessionDrawer
        key={editing?.id ?? 'new'}
        session={editing}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        suggestedName={suggestNextName(query.data?.items)}
      />
      <ConfirmDialog
        open={!!makeCurrent}
        onClose={() => setMakeCurrent(null)}
        onConfirm={() => {
          if (makeCurrent) setCurrent.mutate(makeCurrent.semester.id);
        }}
        title={makeCurrent ? `Make ${makeCurrent.session.name} ${makeCurrent.semester.label} current?` : 'Change current semester?'}
        message="Every user will see this as the current semester straight away. Registration is closed on all other semesters, so you will need to open it again here if students should register."
        confirmLabel="Set as current"
        loading={setCurrent.isPending}
      />
    </>
  );
}
