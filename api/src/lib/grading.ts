export type Band = {
  grade: string;
  minScore: number;
  maxScore: number;
  point: number;
  remark: string;
};

export const DEFAULT_BANDS: Band[] = [
  { grade: 'A', minScore: 70, maxScore: 100, point: 5, remark: 'Excellent' },
  { grade: 'B', minScore: 60, maxScore: 69, point: 4, remark: 'Very good' },
  { grade: 'C', minScore: 50, maxScore: 59, point: 3, remark: 'Good' },
  { grade: 'D', minScore: 45, maxScore: 49, point: 2, remark: 'Fair' },
  { grade: 'E', minScore: 40, maxScore: 44, point: 1, remark: 'Pass' },
  { grade: 'F', minScore: 0, maxScore: 39, point: 0, remark: 'Fail' },
];

export function gradeFor(total: number, bands: Band[]): Band {
  const band = bands.find((b) => total >= b.minScore && total <= b.maxScore);
  if (!band) throw new Error(`No grade band covers a score of ${total}`);
  return band;
}

export type ComputedResult = {
  totalScore: number | null;
  grade: string | null;
  gradePoint: number | null;
};

/** Total, grade and grade point are only set once both CA and exam are present. */
export function computeResult(ca: number | null, exam: number | null, bands: Band[]): ComputedResult {
  if (ca === null || exam === null) return { totalScore: null, grade: null, gradePoint: null };
  const totalScore = ca + exam;
  const band = gradeFor(totalScore, bands);
  return { totalScore, grade: band.grade, gradePoint: band.point };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** GPA = sum(units x grade point) / sum(units), rounded to two decimal places. */
export function gpa(items: { units: number; gradePoint: number }[]) {
  const units = items.reduce((sum, i) => sum + i.units, 0);
  const points = items.reduce((sum, i) => sum + i.units * i.gradePoint, 0);
  return { units, points, gpa: units === 0 ? 0 : round2(points / units) };
}

export function classOfDegree(cgpa: number): string {
  if (cgpa >= 4.5) return 'First Class';
  if (cgpa >= 3.5) return 'Second Class Upper';
  if (cgpa >= 2.4) return 'Second Class Lower';
  if (cgpa >= 1.5) return 'Third Class';
  if (cgpa >= 1.0) return 'Pass';
  return 'Below pass';
}

/** Returns an error message if the bands overlap, leave gaps or do not cover 0-100. */
export function validateBands(bands: Band[]): string | null {
  if (bands.length === 0) return 'Add at least one grade.';
  const grades = new Set(bands.map((b) => b.grade.toUpperCase()));
  if (grades.size !== bands.length) return 'Each grade letter can only appear once.';

  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
  for (const band of sorted) {
    if (band.minScore > band.maxScore) return `Grade ${band.grade}: minimum is above maximum.`;
  }
  if (sorted[0].minScore !== 0) return 'The lowest grade must start at 0.';
  if (sorted[sorted.length - 1].maxScore !== 100) return 'The highest grade must end at 100.';

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.minScore <= prev.maxScore) return `Grades ${prev.grade} and ${cur.grade} overlap.`;
    if (cur.minScore !== prev.maxScore + 1)
      return `Scores ${prev.maxScore + 1}–${cur.minScore - 1} are not covered by any grade.`;
    if (cur.point < prev.point) return `Grade ${cur.grade} should not be worth fewer points than ${prev.grade}.`;
  }
  return null;
}

export type ScoreSummary = {
  students: number;
  graded: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
  distribution: Record<string, number>;
};

export function summarize(
  rows: { totalScore: number | null; grade: string | null; gradePoint: number | null }[],
  bands: Band[],
): ScoreSummary {
  const graded = rows.filter((r) => r.totalScore !== null) as {
    totalScore: number;
    grade: string;
    gradePoint: number;
  }[];
  const distribution: Record<string, number> = {};
  for (const band of [...bands].sort((a, b) => b.minScore - a.minScore)) distribution[band.grade] = 0;
  for (const r of graded) distribution[r.grade] = (distribution[r.grade] ?? 0) + 1;

  const totals = graded.map((r) => r.totalScore);
  return {
    students: rows.length,
    graded: graded.length,
    average: totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
    highest: totals.length ? Math.max(...totals) : null,
    lowest: totals.length ? Math.min(...totals) : null,
    passRate: graded.length ? round2((graded.filter((r) => r.gradePoint > 0).length / graded.length) * 100) : null,
    distribution,
  };
}
