import { describe, expect, it } from 'vitest';
import { classOfDegree, computeResult, DEFAULT_BANDS, gpa, gradeFor, validateBands } from '../src/lib/grading';

describe('grading scale', () => {
  it.each([
    [100, 'A'],
    [70, 'A'],
    [69, 'B'],
    [60, 'B'],
    [50, 'C'],
    [45, 'D'],
    [44, 'E'],
    [40, 'E'],
    [39, 'F'],
    [0, 'F'],
  ])('a total of %i is grade %s', (total, grade) => {
    expect(gradeFor(total, DEFAULT_BANDS).grade).toBe(grade);
  });

  it('only computes a grade once both CA and exam are present', () => {
    expect(computeResult(30, null, DEFAULT_BANDS)).toEqual({ totalScore: null, grade: null, gradePoint: null });
    expect(computeResult(32, 45, DEFAULT_BANDS)).toEqual({ totalScore: 77, grade: 'A', gradePoint: 5 });
    expect(computeResult(18, 30, DEFAULT_BANDS)).toEqual({ totalScore: 48, grade: 'D', gradePoint: 2 });
  });

  it('accepts the default scale', () => {
    expect(validateBands(DEFAULT_BANDS)).toBeNull();
  });

  it('rejects gaps, overlaps and incomplete coverage', () => {
    const gap = DEFAULT_BANDS.map((b) => (b.grade === 'B' ? { ...b, minScore: 62 } : b));
    expect(validateBands(gap)).toMatch(/not covered/);

    const overlap = DEFAULT_BANDS.map((b) => (b.grade === 'C' ? { ...b, maxScore: 62 } : b));
    expect(validateBands(overlap)).toMatch(/overlap/);

    expect(validateBands(DEFAULT_BANDS.filter((b) => b.grade !== 'F'))).toMatch(/start at 0/);
    expect(validateBands([...DEFAULT_BANDS, { ...DEFAULT_BANDS[0] }])).toMatch(/only appear once/);
  });
});

describe('GPA', () => {
  it('weights grade points by course units', () => {
    // 3 units of A (15) + 2 units of D (4) + 3 units of B (12) = 31 / 8
    const result = gpa([
      { units: 3, gradePoint: 5 },
      { units: 2, gradePoint: 2 },
      { units: 3, gradePoint: 4 },
    ]);
    expect(result).toEqual({ units: 8, points: 31, gpa: 3.88 });
  });

  it('is zero when there are no units', () => {
    expect(gpa([]).gpa).toBe(0);
  });

  it.each([
    [4.5, 'First Class'],
    [4.12, 'Second Class Upper'],
    [3.49, 'Second Class Lower'],
    [2.39, 'Third Class'],
    [1.0, 'Pass'],
    [0.8, 'Below pass'],
  ])('a CGPA of %f is %s', (cgpa, label) => {
    expect(classOfDegree(cgpa)).toBe(label);
  });
});
