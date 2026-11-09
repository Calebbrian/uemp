import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, Printer } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Semester } from '../../lib/types';
import { Banner, Button, ButtonLink, Card, cx, PageHeader, RegistrationBadge, Spinner, Tag } from '../../components/ui/primitives';
import { ConfirmDialog, Dialog } from '../../components/ui/overlay';
import { useToast } from '../../components/ui/toast';

type CourseBase = {
  offeringId: string;
  code: string;
  title: string;
  units: number;
  isCore: boolean;
  lecturers: string[];
  capacity: number | null;
  seatsLeft: number | null;
};
type Registered = CourseBase & { enrollmentId: string; canDrop: boolean; dropBlockedReason: string | null };
type Available = CourseBase & { blockedReason: string | null };
type Overview = { semester: Semester | null; maxUnits: number; registered: Registered[]; registeredUnits: number; available: Available[] };

const th = 'border-b border-line bg-subtle px-4 py-2.5 text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';
const td = 'border-b border-line-soft px-4 py-3 align-middle whitespace-nowrap';

export function CourseRegistrationPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [dropping, setDropping] = useState<Registered | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [submitError, setSubmitError] = useState<{ message: string; items?: string[] } | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['student', 'registration'],
    queryFn: () => api.get<Overview>('/student/registration'),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['student'] });

  const register = useMutation({
    mutationFn: (offeringIds: string[]) => api.post<{ registered: string[]; totalUnits: number }>('/student/registration', { offeringIds }),
    onSuccess: (res) => {
      setDone(res.registered);
      setSelected([]);
      setConfirming(false);
      setSubmitError(null);
      refresh();
    },
    onError: (err) => {
      setConfirming(false);
      setSubmitError({ message: err.message, items: err instanceof ApiError ? err.details?.courses : undefined });
      refresh();
    },
  });

  const drop = useMutation({
    mutationFn: (enrollmentId: string) => api.delete<{ dropped: string }>(`/student/registration/${enrollmentId}`),
    onSuccess: (res) => {
      toast.success(`${res.dropped} dropped`);
      setDropping(null);
      refresh();
    },
    onError: (err) => {
      toast.error('Couldn’t drop course', err.message);
      setDropping(null);
    },
  });

  if (isPending) return <Spinner label="Loading courses" />;
  if (error) return <Banner kind="error" title="We couldn’t load course registration.">{error.message}</Banner>;
  if (!data.semester) return <Banner kind="warning" title="There is no active semester.">Registration will open when the registry starts the next semester.</Banner>;

  const open = data.semester.registrationOpen;
  const chosen = data.available.filter((c) => selected.includes(c.offeringId));
  const selectedUnits = chosen.reduce((sum, c) => sum + c.units, 0);
  const total = data.registeredUnits + selectedUnits;
  const over = total > data.maxUnits;
  const counterColor = over ? 'text-danger' : 'text-brand';

  const toggle = (id: string) => {
    setDone(null);
    setSubmitError(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const typeTag = (c: CourseBase) => <Tag kind={c.isCore ? 'core' : 'elective'}>{c.isCore ? 'Core' : 'Elective'}</Tag>;
  const seats = (c: Available) =>
    c.blockedReason ? (
      <span className="font-semibold text-danger-ink">{c.blockedReason}</span>
    ) : c.seatsLeft === null ? (
      <span className="text-muted">Open</span>
    ) : (
      c.seatsLeft
    );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Course Registration"
          description={
            <span className="flex flex-wrap items-center gap-2.5">
              <span>{data.semester.label}</span>
              <RegistrationBadge open={open} />
            </span>
          }
        />
        <div role="status" aria-live="polite" className="num flex min-w-[240px] flex-col gap-1.5">
          <span className={cx('text-sm font-semibold', counterColor)}>
            {total} of {data.maxUnits} units selected
          </span>
          <div className="h-2 overflow-hidden rounded-full bg-draft-bg">
            <div className={cx('h-full', over ? 'bg-danger' : 'bg-brand')} style={{ width: `${Math.min(100, (total / data.maxUnits) * 100)}%` }} />
          </div>
        </div>
      </div>

      {!open && (
        <Banner kind="warning" title="Registration is closed.">
          You can’t add or drop courses. Contact your department if something is wrong.
        </Banner>
      )}
      {over && (
        <Banner kind="error" title={`You’re ${total - data.maxUnits} units over the limit.`}>
          Remove a course to bring your total to {data.maxUnits} units or fewer.
        </Banner>
      )}
      {submitError && (
        <Banner kind="error" title="Registration failed.">
          {submitError.message}
          {submitError.items && (
            <ul className="m-0 mt-1 pl-5">
              {submitError.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </Banner>
      )}
      {done && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-[#A9D8BB] bg-ok-bg px-4 py-3.5 text-sm text-[#0B4526]">
          <Check className="size-[18px]" strokeWidth={2.5} aria-hidden />
          <span className="flex-[1_1_300px]">
            <strong>Registration submitted.</strong> {done.join(', ')} added. They now appear in My Courses and your department can see them.
          </span>
          <ButtonLink to="/student/print/registration" variant="secondary" size="sm" icon={Printer}>
            Print registration slip
          </ButtonLink>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <h2 className="m-0 text-base font-semibold">Already registered</h2>
          <span className="num text-[13px] text-muted">
            {data.registered.length} courses · {data.registeredUnits} units
          </span>
        </div>
        {data.registered.length === 0 ? (
          <p className="m-0 px-4 py-6 text-sm text-muted">You haven’t registered any courses this semester.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cx(th, 'text-left')}>Code</th>
                  <th className={cx(th, 'text-left')}>Title</th>
                  <th className={cx(th, 'text-right')}>Units</th>
                  <th className={cx(th, 'text-left')}>Type</th>
                  <th className={cx(th, 'text-left')}>Lecturer(s)</th>
                  <th className={cx(th, 'text-right')}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.registered.map((r) => (
                  <tr key={r.enrollmentId}>
                    <td className={cx(td, 'font-semibold')}>
                      <span className="inline-flex items-center gap-1.5">
                        <Lock className="size-3.5 text-muted" aria-label="Registered" />
                        {r.code}
                      </span>
                    </td>
                    <td className={td}>{r.title}</td>
                    <td className={cx(td, 'num text-right')}>{r.units}</td>
                    <td className={td}>{typeTag(r)}</td>
                    <td className={td}>{r.lecturers.join(', ') || '—'}</td>
                    <td className={cx(td, 'text-right')}>
                      {r.canDrop ? (
                        <Button variant="secondary" size="sm" onClick={() => setDropping(r)} aria-label={`Drop ${r.code}`}>
                          Drop
                        </Button>
                      ) : (
                        <span className="text-[13px] text-muted">{r.dropBlockedReason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <h2 className="m-0 text-base font-semibold">Available courses</h2>
          <span className="text-[13px] text-muted">{open ? 'Tick the courses you want to add' : 'Selection is disabled'}</span>
        </div>
        {data.available.length === 0 ? (
          <p className="m-0 px-4 py-6 text-sm text-muted">There are no more courses available for your programme and level this semester.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cx(th, 'w-12')}>
                      <span className="sr-only">Select</span>
                    </th>
                    <th className={cx(th, 'text-left')}>Code</th>
                    <th className={cx(th, 'text-left')}>Title</th>
                    <th className={cx(th, 'text-right')}>Units</th>
                    <th className={cx(th, 'text-left')}>Type</th>
                    <th className={cx(th, 'text-left')}>Lecturer(s)</th>
                    <th className={cx(th, 'text-right')}>Seats left</th>
                  </tr>
                </thead>
                <tbody>
                  {data.available.map((c) => {
                    const on = selected.includes(c.offeringId);
                    const id = `course-${c.offeringId}`;
                    return (
                      <tr key={c.offeringId} className={on ? 'bg-[#F4FAF6]' : undefined}>
                        <td className={td}>
                          <input id={id} type="checkbox" className="size-[18px] cursor-pointer accent-brand disabled:cursor-not-allowed" checked={on} disabled={!open || !!c.blockedReason} onChange={() => toggle(c.offeringId)} />
                        </td>
                        <td className={cx(td, 'font-semibold')}>
                          <label htmlFor={id} className="cursor-pointer">
                            {c.code}
                          </label>
                        </td>
                        <td className={td}>
                          <label htmlFor={id} className="cursor-pointer">
                            {c.title}
                          </label>
                        </td>
                        <td className={cx(td, 'num text-right')}>{c.units}</td>
                        <td className={td}>{typeTag(c)}</td>
                        <td className={td}>{c.lecturers.join(', ') || '—'}</td>
                        <td className={cx(td, 'num text-right')}>{seats(c)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-3 md:hidden">
              {data.available.map((c) => {
                const on = selected.includes(c.offeringId);
                const disabled = !open || !!c.blockedReason;
                return (
                  <li key={c.offeringId}>
                    <label className={cx('flex gap-3 rounded-lg border p-3.5', on ? 'border-brand shadow-[0_0_0_1px_var(--color-brand)]' : 'border-line', disabled ? 'bg-subtle' : 'cursor-pointer bg-white')}>
                      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand" checked={on} disabled={disabled} onChange={() => toggle(c.offeringId)} />
                      <span className="flex flex-1 flex-col gap-1">
                        <span className="flex justify-between gap-2">
                          <strong className="text-[15px]">{c.code}</strong>
                          <span className="num text-sm font-semibold">{c.units} units</span>
                        </span>
                        <span className="text-sm">{c.title}</span>
                        <span className="text-xs text-muted">
                          {c.isCore ? 'Core' : 'Elective'} · {c.lecturers.join(', ') || 'Lecturer to be assigned'}
                          {c.blockedReason ? (
                            <span className="font-semibold text-danger-ink"> · {c.blockedReason}</span>
                          ) : c.seatsLeft !== null ? (
                            ` · ${c.seatsLeft} seats left`
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <div className="sticky bottom-0 z-[5] -mx-4 -mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line bg-white px-4 py-3.5 md:-mx-8 md:-mb-7 md:px-8">
        <div className="num flex flex-[1_1_320px] flex-col gap-0.5">
          <span className="text-sm">
            <strong>{chosen.length} selected</strong> · {chosen.length ? chosen.map((c) => c.code).join(', ') : 'No new courses selected'}
          </span>
          <span className={cx('text-[13px]', counterColor)}>
            Total after submitting: {total} of {data.maxUnits} units
          </span>
        </div>
        <Button className="h-11 px-[22px]" disabled={!open || over || chosen.length === 0} onClick={() => setConfirming(true)}>
          Submit registration
        </Button>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        role="alertdialog"
        title="Register for these courses?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={register.isPending}>
              Cancel
            </Button>
            <Button onClick={() => register.mutate(selected)} loading={register.isPending}>
              Confirm registration
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <ul className="m-0 list-none rounded-lg border border-line p-0">
            {chosen.map((c) => (
              <li key={c.offeringId} className="num flex justify-between gap-3 border-b border-line-soft px-3.5 py-2.5 text-sm">
                <span>
                  <strong>{c.code}</strong> {c.title}
                </span>
                <span>{c.units} units</span>
              </li>
            ))}
            <li className="num flex justify-between bg-subtle px-3.5 py-2.5 text-sm font-semibold">
              <span>New semester total</span>
              <span>{total} units</span>
            </li>
          </ul>
          <p className="m-0 text-[13px] text-muted">You can drop a course while registration is open, until results for it are started.</p>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!dropping}
        onClose={() => setDropping(null)}
        onConfirm={() => dropping && drop.mutate(dropping.enrollmentId)}
        title={`Drop ${dropping?.code ?? ''}?`}
        message={
          <>
            <strong>{dropping?.title}</strong> ({dropping?.units} units) will be removed from your registration. You can add it again while registration is open.
          </>
        }
        confirmLabel="Drop course"
        danger
        loading={drop.isPending}
      />
    </>
  );
}
