import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { formatSemester, fullName, programLabel, resolveSemester } from '../lib/academic';
import { sendCsv } from '../lib/csv';
import { csvRequested } from '../lib/query';
import { departmentFilter } from '../lib/scope';
import { id, level, optionalQuery, pageArgs, pagination, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';

/**
 * Registrations a department can see: its own students' registrations, plus
 * anyone registered for a course the department owns (e.g. the Mathematics
 * admin sees Computer Science students taking MTH 201).
 */
export const registrationsRouter = Router();
registrationsRouter.use(requirePermission('registrations.view'));

const listQuery = pagination.extend({
  semesterId: optionalQuery(id),
  offeringId: optionalQuery(id),
  programId: optionalQuery(id),
  level: optionalQuery(level),
  departmentId: optionalQuery(id),
  q: optionalQuery(z.string().trim().max(100)),
});

registrationsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const q = parse(listQuery, req.query);
  const semester = await resolveSemester(prisma, q.semesterId);
  if (!semester) {
    res.json({ semester: null, items: [], total: 0, page: 1, pageSize: q.pageSize });
    return;
  }
  const dept = departmentFilter(user, q.departmentId);

  const where: Prisma.EnrollmentWhereInput = {
    offeringId: q.offeringId,
    offering: { semesterId: semester.id },
    student: {
      programId: q.programId,
      level: q.level,
      ...(q.q
        ? {
            OR: [
              { matricNo: { contains: q.q, mode: 'insensitive' } },
              { user: { firstName: { contains: q.q, mode: 'insensitive' } } },
              { user: { lastName: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    ...(dept ? { OR: [{ student: { user: { departmentId: dept } } }, { offering: { course: { departmentId: dept } } }] } : {}),
  };
  const include = {
    student: { include: { user: { include: { department: true } }, program: true } },
    offering: { include: { course: true } },
  } satisfies Prisma.EnrollmentInclude;
  const orderBy: Prisma.EnrollmentOrderByWithRelationInput[] = [
    { student: { matricNo: 'asc' } },
    { offering: { course: { code: 'asc' } } },
  ];

  const format = (e: Prisma.EnrollmentGetPayload<{ include: typeof include }>) => ({
    id: e.id,
    matricNo: e.student.matricNo,
    studentId: e.studentId,
    studentName: fullName(e.student.user),
    program: programLabel(e.student.program),
    department: e.student.user.department?.code ?? null,
    level: e.student.level,
    offeringId: e.offeringId,
    courseCode: e.offering.course.code,
    courseTitle: e.offering.course.title,
    units: e.units,
    registeredAt: e.createdAt,
  });

  if (csvRequested(req)) {
    const rows = await prisma.enrollment.findMany({ where, include, orderBy });
    sendCsv(
      res,
      `registrations-${semester.session.name.replace('/', '-')}-${semester.term.toLowerCase()}.csv`,
      ['Matric no.', 'Student', 'Department', 'Programme', 'Level', 'Course', 'Title', 'Units', 'Registered'],
      rows.map(format).map((r) => [r.matricNo, r.studentName, r.department, r.program, r.level, r.courseCode, r.courseTitle, r.units, r.registeredAt.toISOString()]),
    );
    return;
  }

  const [items, total, students] = await Promise.all([
    prisma.enrollment.findMany({ where, include, orderBy, ...pageArgs(q) }),
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({ where, distinct: ['studentId'], select: { studentId: true } }),
  ]);
  res.json({
    semester: formatSemester(semester),
    items: items.map(format),
    total,
    students: students.length,
    page: q.page,
    pageSize: q.pageSize,
  });
});
