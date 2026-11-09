import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Band } from '../../lib/types';
import { Banner, Button, Card, cx, IconButton, PageHeader, Skeleton } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/toast';

type Row = { key: number; grade: string; minScore: string; maxScore: string; point: string; remark: string };

const DEFAULT_BANDS: Band[] = [
  { grade: 'A', minScore: 70, maxScore: 100, point: 5, remark: 'Excellent' },
  { grade: 'B', minScore: 60, maxScore: 69, point: 4, remark: 'Very good' },
  { grade: 'C', minScore: 50, maxScore: 59, point: 3, remark: 'Good' },
  { grade: 'D', minScore: 45, maxScore: 49, point: 2, remark: 'Fair' },
  { grade: 'E', minScore: 40, maxScore: 44, point: 1, remark: 'Pass' },
  { grade: 'F', minScore: 0, maxScore: 39, point: 0, remark: 'Fail' },
];

const CLASSES = [
  ['First Class', '4.50 and above'],
  ['Second Class Upper', '3.50 – 4.49'],
  ['Second Class Lower', '2.40 – 3.49'],
  ['Third Class', '1.50 – 2.39'],
  ['Pass', '1.00 – 1.49'],
];

let nextKey = 1;
const toRows = (bands: Band[]): Row[] =>
  [...bands]
    .sort((a, b) => b.minScore - a.minScore)
    .map((b) => ({ key: nextKey++, grade: b.grade, minScore: String(b.minScore), maxScore: String(b.maxScore), point: String(b.point), remark: b.remark }));

const isInt = (v: string) => /^\d+$/.test(v.trim());
const isNum = (v: string) => v.trim() !== '' && !Number.isNaN(Number(v));

/** Same rules the API enforces, collected as a list so every problem shows at once. */
function validate(rows: Row[]): { errors: string[]; bad: Set<number> } {
  const errors: string[] = [];
  const bad = new Set<number>();
  const flag = (msg: string, ...keys: number[]) => {
    errors.push(msg);
    keys.forEach((k) => bad.add(k));
  };

  if (rows.length < 2) flag('Add at least two grades.');

  const seen = new Map<string, number>();
  for (const r of rows) {
    const g = r.grade.trim().toUpperCase();
    const label = g || 'Unnamed grade';
    if (!g) flag('Every row needs a grade letter.', r.key);
    else if (g.length > 2) flag(`Grade ${g}: use one or two characters.`, r.key);
    else if (seen.has(g)) flag(`Grade ${g} appears more than once.`, r.key, seen.get(g)!);
    else seen.set(g, r.key);

    if (!isInt(r.minScore) || !isInt(r.maxScore)) flag(`${label}: scores must be whole numbers from 0 to 100.`, r.key);
    else if (Number(r.minScore) > 100 || Number(r.maxScore) > 100) flag(`${label}: scores cannot be above 100.`, r.key);
    else if (Number(r.minScore) > Number(r.maxScore)) flag(`${label}: minimum must be less than or equal to maximum.`, r.key);

    if (!isNum(r.point) || Number(r.point) < 0 || Number(r.point) > 10) flag(`${label}: grade point must be between 0 and 10.`, r.key);
    if (!r.remark.trim()) flag(`${label}: add a remark.`, r.key);
  }
  if (errors.length) return { errors, bad };

  const sorted = [...rows].sort((a, b) => Number(a.minScore) - Number(b.minScore));
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  if (Number(lowest.minScore) !== 0) flag(`The lowest grade (${lowest.grade}) must start at 0.`, lowest.key);
  if (Number(highest.maxScore) !== 100) flag(`The highest grade (${highest.grade}) must go up to 100.`, highest.key);
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1];
    const hi = sorted[i];
    const loMax = Number(lo.maxScore);
    const hiMin = Number(hi.minScore);
    if (hiMin <= loMax) flag(`Grades ${lo.grade} and ${hi.grade} overlap: ${lo.grade} ends at ${loMax} but ${hi.grade} starts at ${hiMin}.`, lo.key, hi.key);
    else if (hiMin !== loMax + 1) flag(`Gap between ${lo.grade} and ${hi.grade}: scores ${loMax + 1}–${hiMin - 1} have no grade.`, lo.key, hi.key);
    if (Number(hi.point) < Number(lo.point)) flag(`Grade ${hi.grade} should not be worth fewer points than ${lo.grade}.`, lo.key, hi.key);
  }
  return { errors, bad };
}

const sameBands = (rows: Row[], bands: Band[]) => {
  const a = rows.map((r) => `${r.grade.trim().toUpperCase()}|${Number(r.minScore)}|${Number(r.maxScore)}|${Number(r.point)}|${r.remark.trim()}`).sort();
  const b = bands.map((x) => `${x.grade}|${x.minScore}|${x.maxScore}|${x.point}|${x.remark}`).sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

const cellCls = 'h-9 rounded-md border bg-white px-2.5 text-sm text-ink';

export function GradingScalePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['grading-scale'],
    queryFn: () => api.get<{ bands: Band[] }>('/meta/grading-scale'),
  });
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (query.data && rows === null) setRows(toRows(query.data.bands));
  }, [query.data, rows]);

  const { errors, bad } = useMemo(() => validate(rows ?? []), [rows]);
  const dirty = !!rows && !!query.data && !sameBands(rows, query.data.bands);

  const save = useMutation({
    mutationFn: () =>
      api.put<{ bands: Band[] }>('/grading-scale', {
        bands: rows!.map((r) => ({
          grade: r.grade.trim().toUpperCase(),
          minScore: Number(r.minScore),
          maxScore: Number(r.maxScore),
          point: Number(r.point),
          remark: r.remark.trim(),
        })),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['grading-scale'], data);
      setRows(toRows(data.bands));
      toast.success('Grading scale saved', 'New scores will be graded with this scale.');
    },
    onError: (err) => toast.error('Couldn’t save the grading scale', errorMessage(err)),
  });

  const update = (key: number, field: keyof Omit<Row, 'key'>, value: string) =>
    setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  return (
    <>
      <PageHeader
        title="Grading Scale"
        description="Applies to every department. New scores are graded with the scale in force when they are saved."
        actions={
          <>
            <Button variant="secondary" onClick={() => setRows(toRows(DEFAULT_BANDS))} disabled={!rows}>
              Reset to default
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => query.data && setRows(toRows(query.data.bands))}>
                Discard changes
              </Button>
            )}
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!rows || errors.length > 0 || !dirty}>
              Save scale
            </Button>
          </>
        }
      />

      {errors.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-lg border border-danger-line bg-danger-50 px-4 py-3.5 text-sm text-[#7F1A13]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <strong>Fix the score ranges before saving.</strong>
            {errors.map((e) => (
              <span key={e} className="num">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {query.error && <Banner kind="error" title="We couldn’t load the grading scale.">{errorMessage(query.error)}</Banner>}

      <Card className="max-w-[1100px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Grade bands</caption>
            <thead>
              <tr>
                {[
                  ['Grade', 'text-left'],
                  ['Min score', 'text-right'],
                  ['Max score', 'text-right'],
                  ['Grade point', 'text-right'],
                  ['Remark', 'text-left'],
                  ['', ''],
                ].map(([h, align], i) => (
                  <th key={i} scope="col" className={cx('border-b border-line bg-subtle px-4 py-2.5 text-xs font-semibold tracking-[0.04em] whitespace-nowrap text-[#555F5A] uppercase', align)}>
                    {h || <span className="sr-only">Remove</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!rows &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={j} className="border-b border-line-soft px-4 py-3.5">
                        <Skeleton className="h-3" />
                      </td>
                    ))}
                    <td className="border-b border-line-soft" />
                  </tr>
                ))}
              {rows?.map((r) => {
                const invalid = bad.has(r.key);
                const border = invalid ? 'border-danger' : 'border-line-strong';
                const name = r.grade.trim().toUpperCase() || 'new grade';
                return (
                  <tr key={r.key} className={invalid ? 'bg-[#FFF7F6]' : undefined}>
                    <td className="w-20 border-b border-line-soft px-4 py-2">
                      <input
                        value={r.grade}
                        onChange={(e) => update(r.key, 'grade', e.target.value.toUpperCase())}
                        aria-label="Grade letter"
                        maxLength={2}
                        className={cx(cellCls, border, 'w-14 text-center text-base font-bold')}
                      />
                    </td>
                    {(['minScore', 'maxScore', 'point'] as const).map((field) => (
                      <td key={field} className="border-b border-line-soft px-4 py-2 text-right">
                        <input
                          type="number"
                          inputMode={field === 'point' ? 'decimal' : 'numeric'}
                          min={0}
                          max={field === 'point' ? 10 : 100}
                          step={field === 'point' ? 0.5 : 1}
                          value={r[field]}
                          onChange={(e) => update(r.key, field, e.target.value)}
                          aria-label={`${field === 'minScore' ? 'Minimum score' : field === 'maxScore' ? 'Maximum score' : 'Grade point'} for ${name}`}
                          aria-invalid={invalid && field !== 'point' ? true : undefined}
                          className={cx(cellCls, field === 'point' ? 'border-line-strong' : border, 'num w-[84px] text-right')}
                        />
                      </td>
                    ))}
                    <td className="border-b border-line-soft px-4 py-2">
                      <input
                        value={r.remark}
                        onChange={(e) => update(r.key, 'remark', e.target.value)}
                        aria-label={`Remark for ${name}`}
                        className={cx(cellCls, 'border-line-strong w-full min-w-[140px]')}
                      />
                    </td>
                    <td className="border-b border-line-soft px-2 py-2 text-right">
                      <IconButton label={`Remove ${name}`} icon={Trash2} disabled={rows.length <= 2} onClick={() => setRows((rs) => rs!.filter((x) => x.key !== r.key))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              disabled={rows.length >= 12}
              onClick={() => setRows((rs) => [...rs!, { key: nextKey++, grade: '', minScore: '', maxScore: '', point: '', remark: '' }])}
            >
              Add grade
            </Button>
            <span className="text-[13px] text-muted">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          </div>
        )}
      </Card>

      <div className="grid max-w-[1100px] items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(400px,100%),1fr))]">
        <Card className="flex flex-col gap-3 p-5" aria-labelledby="gpa-title">
          <h2 id="gpa-title" className="m-0 text-base font-semibold">
            How GPA is calculated
          </h2>
          <p className="m-0 text-[15px]">
            <code className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[13px] text-brand-hover">GPA = Σ(units × grade point) ÷ Σ units</code>
          </p>
          <p className="m-0 text-sm leading-[21px] text-ink-2">
            CGPA uses the same formula across every approved semester. Example: CSC 201 (3 units, A = 5) and MTH 201 (3 units, B = 4) → (15 + 12) ÷ 6 ={' '}
            <strong className="num">4.50</strong>.
          </p>
          <p className="m-0 rounded-md bg-subtle px-3 py-2.5 text-sm leading-[21px] text-ink-2">
            <strong>Existing approved results keep the grade they were given.</strong> The grade and grade point are stored when scores are entered, so a new scale
            only affects scores saved after it.
          </p>
        </Card>
        <Card className="overflow-hidden" aria-labelledby="class-title">
          <h2 id="class-title" className="m-0 border-b border-line px-5 py-4 text-base font-semibold">
            Class of degree
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="border-b border-line bg-subtle px-4 py-2.5 text-left text-xs font-semibold tracking-[0.04em] text-[#555F5A] uppercase">
                  Class
                </th>
                <th scope="col" className="border-b border-line bg-subtle px-4 py-2.5 text-right text-xs font-semibold tracking-[0.04em] text-[#555F5A] uppercase">
                  CGPA
                </th>
              </tr>
            </thead>
            <tbody className="num">
              {CLASSES.map(([name, range]) => (
                <tr key={name}>
                  <td className="border-b border-line-soft px-4 py-2.5 last:border-b-0">{name}</td>
                  <td className="border-b border-line-soft px-4 py-2.5 text-right">{range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
