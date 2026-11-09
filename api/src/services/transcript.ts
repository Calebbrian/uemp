import { prisma } from '../db';
import { formatSemester, semesterOrder } from '../lib/academic';
import { classOfDegree, gpa } from '../lib/grading';

/**
 * A student's results grouped by semester. Only scores from APPROVED result
 * sheets are included; anything else is counted as "awaiting approval".
 */
export async function transcript(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    include: {
      result: true,
      offering: { include: { course: true, semester: { include: { session: true } }, resultSheet: true } },
    },
  });

  type Group = {
    semester: NonNullable<ReturnType<typeof formatSemester>>;
    order: number;
    courses: {
      code: string;
      title: string;
      units: number;
      caScore: number;
      examScore: number;
      totalScore: number;
      grade: string;
      gradePoint: number;
    }[];
    pending: number;
  };
  const groups = new Map<string, Group>();

  for (const e of enrollments) {
    const s = e.offering.semester;
    let group = groups.get(s.id);
    if (!group) {
      group = { semester: formatSemester(s)!, order: semesterOrder(s), courses: [], pending: 0 };
      groups.set(s.id, group);
    }
    const approved = e.offering.resultSheet?.status === 'APPROVED';
    const r = e.result;
    if (approved && r && r.totalScore !== null && r.grade !== null && r.gradePoint !== null) {
      group.courses.push({
        code: e.offering.course.code,
        title: e.offering.course.title,
        units: e.units,
        caScore: r.caScore!,
        examScore: r.examScore!,
        totalScore: r.totalScore,
        grade: r.grade,
        gradePoint: r.gradePoint,
      });
    } else {
      group.pending += 1;
    }
  }

  const ordered = [...groups.values()].sort((a, b) => a.order - b.order);
  const cumulative: { units: number; gradePoint: number }[] = [];
  const semesters = ordered.map((g) => {
    g.courses.sort((a, b) => a.code.localeCompare(b.code));
    cumulative.push(...g.courses);
    const sem = gpa(g.courses);
    const cum = gpa(cumulative);
    return {
      semester: g.semester,
      courses: g.courses,
      pending: g.pending,
      units: sem.units,
      gpa: g.courses.length ? sem.gpa : null,
      cgpa: cumulative.length ? cum.gpa : null,
    };
  });

  const overall = gpa(cumulative);
  const unitsPassed = cumulative.filter((c) => c.gradePoint > 0).reduce((sum, c) => sum + c.units, 0);
  const lastWithResults = [...semesters].reverse().find((s) => s.gpa !== null);

  return {
    cgpa: cumulative.length ? overall.gpa : null,
    classOfDegree: cumulative.length ? classOfDegree(overall.gpa) : null,
    unitsAttempted: overall.units,
    unitsPassed,
    lastGpa: lastWithResults?.gpa ?? null,
    semesters: semesters.reverse(),
  };
}
