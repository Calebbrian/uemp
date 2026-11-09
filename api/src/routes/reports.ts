import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { formatSemester, fullName, programLabel, resolveSemester } from '../lib/academic';
import { sendCsv } from '../lib/csv';
import { round2, summarize } from '../lib/grading';
import { csvRequested } from '../lib/query';
import { departmentFilter } from '../lib/scope';
import { id, level, optionalQuery, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';
import { getBands } from '../services/results';
import { transcript } from '../services/transcript';
import { formatStudent, studentWhere } from './students';

export const reportsRouter = Router();
reportsRouter.use(requirePermission('reports.view'));

/** Report 1: student list. */
reportsRouter.get('/students', async (req, res) => {
  const user = currentUser(req);
  const q = parse(
    z.object({
      programId: optionalQuery(id),
      level: optionalQuery(level),
      status: optionalQuery(z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED'])),
      departmentId: optionalQuery(id),
    }),
    req.query,
  );
  const students = await prisma.student.findMany({
    where: studentWhere(departmentFilter(user, q.departmentId), { ...q, page: 1, pageSize: 1 }),
    include: { user: { include: { department: true } }, program: true },
    orderBy: [{ level: 'asc' }, { matricNo: 'asc' }],
  });
  if (csvRequested(req)) {
    sendCsv(
      res,
      'student-list.csv',
      ['Matric no.', 'Name', 'Email', 'Department', 'Programme', 'Level', 'Entry year', 'Status'],
      students.map((s) => [s.matricNo, fullName(s.user), s.user.email, s.user.department?.code, programLabel(s.program), s.level, s.entryYear, s.user.status]),
    );
    return;
  }
  res.json({ items: students.map(formatStudent), total: students.length });
});

/** Report 2: registrations per course offering in a semester. */
reportsRouter.get('/registrations', async (req, res) => {
  const user = currentUser(req);
  const q = parse(z.object({ semesterId: optionalQuery(id), departmentId: optionalQuery(id) }), req.query);
  const semester = await resolveSemester(prisma, q.semesterId);
  if (!semester) {
    res.json({ semester: null, items: [] });
    return;
  }
  const offerings = await prisma.courseOffering.findMany({
    where: { semesterId: semester.id, course: { departmentId: departmentFilter(user, q.departmentId) } },
    include: {
      course: { include: { department: true } },
      allocations: { include: { lecturer: { include: { user: true } } } },
      _count: { select: { enrollments: true } },
    },
    orderBy: [{ course: { level: 'asc' } }, { course: { code: 'asc' } }],
  });
  const items = offerings.map((o) => ({
    offeringId: o.id,
    code: o.course.code,
    title: o.course.title,
    units: o.course.units,
    level: o.course.level,
    department: o.course.department.code,
    lecturers: o.allocations.map((a) => fullName(a.lecturer.user)),
    registered: o._count.enrollments,
    capacity: o.capacity,
  }));
  if (csvRequested(req)) {
    sendCsv(
      res,
      'registration-report.csv',
      ['Course', 'Title', 'Units', 'Level', 'Department', 'Lecturers', 'Registered', 'Capacity'],
      items.map((i) => [i.code, i.title, i.units, i.level, i.department, i.lecturers.join('; '), i.registered, i.capacity ?? 'Unlimited']),
    );
    return;
  }
  res.json({
    semester: formatSemester(semester),
    items,
    totals: { offerings: items.length, registrations: items.reduce((sum, i) => sum + i.registered, 0) },
  });
});

/** Report 3: academic performance per course, plus average CGPA per level. */
reportsRouter.get('/performance', async (req, res) => {
  const user = currentUser(req);
  const q = parse(z.object({ semesterId: optionalQuery(id), departmentId: optionalQuery(id) }), req.query);
  const semester = await resolveSemester(prisma, q.semesterId);
  const dept = departmentFilter(user, q.departmentId);
  const bands = await getBands();

  const offerings = semester
    ? await prisma.courseOffering.findMany({
        where: { semesterId: semester.id, course: { departmentId: dept } },
        include: {
          course: true,
          resultSheet: true,
          enrollments: { include: { result: true } },
        },
        orderBy: { course: { code: 'asc' } },
      })
    : [];

  const courses = offerings.map((o) => {
    const summary = summarize(
      o.enrollments.map((e) => ({
        totalScore: e.result?.totalScore ?? null,
        grade: e.result?.grade ?? null,
        gradePoint: e.result?.gradePoint ?? null,
      })),
      bands,
    );
    return { offeringId: o.id, code: o.course.code, title: o.course.title, status: o.resultSheet?.status ?? 'DRAFT', ...summary };
  });

  const students = await prisma.student.findMany({
    where: { user: { departmentId: dept, status: 'ACTIVE' } },
    select: { userId: true, level: true },
  });
  const byLevel = new Map<number, number[]>();
  for (const s of students) {
    const t = await transcript(s.userId);
    if (t.cgpa === null) continue;
    byLevel.set(s.level, [...(byLevel.get(s.level) ?? []), t.cgpa]);
  }
  const levels = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lvl, cgpas]) => ({
      level: lvl,
      students: cgpas.length,
      averageCgpa: round2(cgpas.reduce((a, b) => a + b, 0) / cgpas.length),
      highestCgpa: Math.max(...cgpas),
      lowestCgpa: Math.min(...cgpas),
    }));

  if (csvRequested(req)) {
    const grades = bands.map((b) => b.grade);
    sendCsv(
      res,
      'performance-summary.csv',
      ['Course', 'Title', 'Result status', 'Students', 'Graded', 'Average', 'Highest', 'Lowest', 'Pass rate %', ...grades],
      courses.map((c) => [c.code, c.title, c.status, c.students, c.graded, c.average, c.highest, c.lowest, c.passRate, ...grades.map((g) => c.distribution[g] ?? 0)]),
    );
    return;
  }
  res.json({ semester: formatSemester(semester), courses, levels, grades: bands.map((b) => b.grade) });
});
