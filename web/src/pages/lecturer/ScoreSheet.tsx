import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import type { Band, ScoreSummary, SheetDetail } from '../../lib/types';
import { Banner, Button, Card, cx, Spinner, StatusBadge } from '../../components/ui/primitives';
import { ConfirmDialog } from '../../components/ui/overlay';
import { useToast } from '../../components/ui/toast';
import { SheetHistory, SheetStatusBanner, SheetSummary } from '../../components/results';

type Edits = Record<string, { ca?: string; exam?: string }>;

function parseScore(text: string, max: number): { value: number | null; error: string | null } {
  const t = text.trim();
  if (t === '') return { value: null, error: null };
  if (!/^\d+$/.test(t)) return { value: null, error: 'Use whole numbers only.' };
  const n = Number(t);
  if (n > max) return { value: null, error: `must be between 0 and ${max}.` };
  return { value: n, error: null };
}

const bandFor = (total: number, bands: Band[]) => bands.find((b) => total >= b.minScore && total <= b.maxScore);

function summarize(rows: { total: number | null; grade: string | null; point: number | null }[], bands: Band[]): ScoreSummary {
  const graded = rows.filter((r) => r.total !== null) as { total: number; grade: string; point: number }[];
  const distribution: Record<string, number> = {};
  for (const b of [...bands].sort((a, b) => b.minScore - a.minScore)) distribution[b.grade] = 0;
  for (const r of graded) distribution[r.grade] = (distribution[r.grade] ?? 0) + 1;
  const totals = graded.map((r) => r.total);
  return {
    students: rows.length,
    graded: graded.length,
    average: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null,
    highest: totals.length ? Math.max(...totals) : null,
    lowest: totals.length ? Math.min(...totals) : null,
    passRate: graded.length ? (graded.filter((r) => r.point > 0).length / graded.length) * 100 : null,
    distribution,
  };
}

const th = 'border-b border-line bg-subtle px-3.5 py-2.5 text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase';
const td = 'border-b border-line-soft px-3.5 py-2 align-middle whitespace-nowrap';

export function ScoreSheetPage() {
  const { offeringId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['lecturer', 'sheet', offeringId];
  const query = useQuery({ queryKey, queryFn: () => api.get<SheetDetail>(`/lecturer/offerings/${offeringId}`) });
  const [edits, setEdits] = useState<Edits>({});
  const [confirming, setConfirming] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const data = query.data;
  const locked = data ? data.sheet.status === 'SUBMITTED' || data.sheet.status === 'APPROVED' : true;

  const rows = useMemo(() => {
    if (!data) return [];
    const { caMax, examMax } = data.limits;
    return data.students.map((s) => {
      const e = edits[s.enrollmentId] ?? {};
      const caText = e.ca ?? (s.caScore === null ? '' : String(s.caScore));
      const examText = e.exam ?? (s.examScore === null ? '' : String(s.examScore));
      const ca = parseScore(caText, caMax);
      const exam = parseScore(examText, examMax);
      const complete = ca.value !== null && exam.value !== null;
      const total = complete ? ca.value! + exam.value! : null;
      const band = total !== null ? bandFor(total, data.gradeBands) : undefined;
      const changed = ca.value !== s.caScore || exam.value !== s.examScore || (caText !== '' && ca.error !== null) || (examText !== '' && exam.error !== null);
      const message = ca.error ? `CA ${ca.error === 'Use whole numbers only.' ? 'score: use whole numbers only.' : `score ${caText} ${ca.error}`}` : exam.error ? `Exam ${exam.error === 'Use whole numbers only.' ? 'score: use whole numbers only.' : `score ${examText} ${exam.error}`}` : null;
      return {
        ...s,
        caText,
        examText,
        caValue: ca.value,
        examValue: exam.value,
        caInvalid: !!ca.error,
        examInvalid: !!exam.error,
        message,
        complete,
        total,
        grade: band?.grade ?? null,
        point: band?.point ?? null,
        changed,
      };
    });
  }, [data, edits]);

  const dirty = rows.some((r) => r.changed);
  const invalid = rows.filter((r) => r.caInvalid || r.examInvalid).length;
  const complete = rows.filter((r) => r.complete).length;
  const summary = useMemo(() => summarize(rows.map((r) => ({ total: r.total, grade: r.grade, point: r.point })), data?.gradeBands ?? []), [rows, data]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const applySheet = (sheet: SheetDetail) => {
    queryClient.setQueryData(queryKey, sheet);
    queryClient.invalidateQueries({ queryKey: ['lecturer'], refetchType: 'none' });
    setEdits({});
  };

  const save = useMutation({
    mutationFn: () =>
      api.put<{ updated: number; sheet: SheetDetail }>(`/lecturer/offerings/${offeringId}/scores`, {
        scores: rows.filter((r) => r.changed).map((r) => ({ enrollmentId: r.enrollmentId, caScore: r.caValue, examScore: r.examValue })),
      }),
    onSuccess: (res) => {
      applySheet(res.sheet);
      setSavedAt(new Date());
      toast.success('Draft saved', `${data!.offering.course.code} · ${res.sheet.summary.graded} of ${res.sheet.summary.students} students scored`);
    },
    onError: (err) => toast.error('Couldn’t save scores', err.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (dirty) {
        const saved = await save.mutateAsync();
        if (!saved) return null;
      }
      return api.post<SheetDetail>(`/lecturer/offerings/${offeringId}/submit`);
    },
    onSuccess: (sheet) => {
      setConfirming(false);
      setSavedAt(null);
      if (sheet) {
        applySheet(sheet);
        toast.success('Submitted for approval', 'Scores are now locked until the department reviews them.');
      }
    },
    onError: (err) => {
      setConfirming(false);
      const missing = err instanceof ApiError ? err.details?.missing : undefined;
      toast.error('Couldn’t submit', missing ? `${err.message} ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` : err.message);
    },
  });

  // Blocks a second request from a fast double-click before the button disables.
  const inFlight = useRef(false);
  const once = (fn: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    fn()
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
      });
  };

  const setCell = (id: string, field: 'ca' | 'exam', value: string) => {
    setSavedAt(null);
    setEdits((e) => ({ ...e, [id]: { ...e[id], [field]: value } }));
  };

  const moveFocus = (e: KeyboardEvent<HTMLInputElement>, col: string, index: number) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = e.key === 'ArrowUp' ? index - 1 : index + 1;
    document.querySelector<HTMLInputElement>(`[data-cell="${col}-${next}"]`)?.focus();
  };

  if (query.isPending) return <Spinner label="Loading score sheet" />;
  if (query.error) return <Banner kind="error" title="We couldn’t open this score sheet.">{query.error.message}</Banner>;

  const { offering, sheet, limits } = data!;
  const cantSubmit = locked || rows.length === 0 || complete < rows.length || invalid > 0;

  const inputCls = (bad: boolean) =>
    cx(
      'num h-9 w-[76px] rounded-md border px-2.5 text-right text-sm',
      locked ? 'border-line bg-surface text-ink-2' : 'bg-white text-ink',
      bad ? 'border-danger shadow-[0_0_0_3px_var(--color-danger-50)]' : !locked && 'border-line-strong',
    );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link to="/lecturer/courses" className="inline-flex items-center gap-1 text-[13px] text-muted! no-underline hover:text-ink!">
            <ArrowLeft className="size-3.5" aria-hidden /> My Courses
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-2xl font-semibold">
              {offering.course.code} · {offering.course.title}
            </h1>
            <StatusBadge status={sheet.status} />
          </div>
          <span className="num text-sm text-muted">
            {offering.semester.label} · {offering.course.units} units · {rows.length} students
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {dirty && !locked && (
            <span role="status" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sub-fg">
              <span className="size-2 rounded-full bg-[#C77700]" /> Unsaved changes
            </span>
          )}
          {!dirty && !locked && savedAt && (
            <span role="status" className="text-[13px] font-semibold text-ok-fg">
              Draft saved just now
            </span>
          )}
          {!locked && (
            <>
              <Button variant="secondary" onClick={() => (invalid ? toast.error('Fix the highlighted scores first') : once(() => save.mutateAsync()))} disabled={!dirty} loading={save.isPending && !submit.isPending}>
                Save draft
              </Button>
              <Button onClick={() => setConfirming(true)} disabled={cantSubmit}>
                Submit for approval
              </Button>
            </>
          )}
        </div>
      </div>

      <SheetStatusBanner sheet={sheet} audience="lecturer" />

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[999_1_620px] overflow-hidden" aria-label="Scores">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3.5 py-3">
            <span className="num text-sm font-semibold">
              {complete} of {rows.length} students fully scored
              {invalid > 0 && <span className="text-danger-ink"> · {invalid} invalid</span>}
            </span>
            <span className="text-[13px] text-muted">
              CA 0–{limits.caMax} · Exam 0–{limits.examMax} · Total, grade and point are calculated
            </span>
          </div>
          {rows.length === 0 ? (
            <p className="m-0 px-4 py-6 text-sm text-muted">No students have registered for this course yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cx(th, 'text-right')}>#</th>
                    <th className={cx(th, 'text-left')}>Matric no.</th>
                    <th className={cx(th, 'text-left')}>Student</th>
                    <th className={cx(th, 'text-right')}>CA (0–{limits.caMax})</th>
                    <th className={cx(th, 'text-right')}>Exam (0–{limits.examMax})</th>
                    <th className={cx(th, 'text-right')}>Total</th>
                    <th className={cx(th, 'text-left')}>Grade</th>
                    <th className={cx(th, 'text-right')}>Point</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const bad = r.caInvalid || r.examInvalid;
                    return (
                      <FragmentRow key={r.enrollmentId} message={r.message}>
                        <tr className={bad ? 'bg-[#FFF7F6]' : !r.complete && !locked ? 'bg-[#FFFCF3]' : undefined}>
                          <td className={cx(td, 'num text-right text-muted')}>{i + 1}</td>
                          <td className={cx(td, 'num font-medium')}>{r.matricNo}</td>
                          <td className={td}>
                            <span className="inline-flex items-center gap-2">
                              {r.name}
                              {!r.complete && !locked && !bad && <span className="rounded bg-sub-bg px-[7px] py-0.5 text-xs font-semibold text-sub-fg">Missing</span>}
                            </span>
                          </td>
                          <td className={cx(td, 'text-right')}>
                            <input
                              className={inputCls(r.caInvalid)}
                              inputMode="numeric"
                              value={r.caText}
                              readOnly={locked}
                              data-cell={`ca-${i}`}
                              onChange={(e) => setCell(r.enrollmentId, 'ca', e.target.value)}
                              onKeyDown={(e) => moveFocus(e, 'ca', i)}
                              aria-label={`CA score for ${r.name}`}
                              aria-invalid={r.caInvalid || undefined}
                            />
                          </td>
                          <td className={cx(td, 'text-right')}>
                            <input
                              className={inputCls(r.examInvalid)}
                              inputMode="numeric"
                              value={r.examText}
                              readOnly={locked}
                              data-cell={`exam-${i}`}
                              onChange={(e) => setCell(r.enrollmentId, 'exam', e.target.value)}
                              onKeyDown={(e) => moveFocus(e, 'exam', i)}
                              aria-label={`Exam score for ${r.name}`}
                              aria-invalid={r.examInvalid || undefined}
                            />
                          </td>
                          <td className={cx(td, 'num text-right font-semibold')}>{r.total ?? '—'}</td>
                          <td className={cx(td, 'font-bold', r.point === 0 && 'text-danger-ink')}>{r.grade ?? '—'}</td>
                          <td className={cx(td, 'num text-right')}>{r.point ?? '—'}</td>
                        </tr>
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="flex flex-[1_1_280px] flex-col gap-5">
          <SheetSummary summary={summary} />
        </div>
      </div>

      <SheetHistory history={data!.history} />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => once(() => submit.mutateAsync())}
        title={`Submit ${offering.course.code} for approval?`}
        message={
          <>
            Scores for all <strong className="num">{rows.length}</strong> students will be <strong>locked</strong>. The {offering.course.department.name} department admin will
            review them. You can edit again only if the sheet is rejected or reopened.
            {dirty && ' Your unsaved changes will be saved first.'}
          </>
        }
        confirmLabel="Submit and lock"
        loading={submit.isPending}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Leave without saving?"
        message="You have unsaved score changes on this sheet. If you leave now they will be lost."
        confirmLabel="Discard changes"
        danger
      />
    </>
  );
}

function FragmentRow({ children, message }: { children: React.ReactNode; message: string | null }) {
  return (
    <>
      {children}
      {message && (
        <tr>
          <td colSpan={8} className="border-b border-[#F0D3CF] bg-[#FFF7F6] px-3.5 pt-0 pb-2.5">
            <span className="text-xs font-semibold text-danger-ink">{message}</span>
          </td>
        </tr>
      )}
    </>
  );
}
