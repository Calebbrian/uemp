import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { formatSemester, fullName, programLabel, semesterOrder } from '../lib/academic';
import { csvRequested } from '../lib/query';
import { sendCsv } from '../lib/csv';
import { notFound, unprocessable } from '../lib/errors';
import { assertDepartmentAccess, departmentFilter } from '../lib/scope';
import {
  email,
  id,
  level,
  matricNo,
  optionalQuery,
  optionalText,
  pageArgs,
  pagination,
  parse,
  personName,
} from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';
import { createAccount, resetPassword } from '../services/accounts';
import { transcript } from '../services/transcript';

export const studentsRouter = Router();
studentsRouter.use(requirePermission('students.manage'));

const studentInclude = {
  user: { include: { department: true } },
  program: true,
} satisfies Prisma.StudentInclude;

type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

export function formatStudent(s: StudentRow) {
  return {
    id: s.userId,
    matricNo: s.matricNo,
    firstName: s.user.firstName,
    lastName: s.user.lastName,
    name: fullName(s.user),
    email: s.user.email,
    phone: s.user.phone,
    status: s.user.status,
    level: s.level,
    entryYear: s.entryYear,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    address: s.address,
    lastLoginAt: s.user.lastLoginAt,
    program: { id: s.program.id, code: s.program.code, name: programLabel(s.program) },
    department: s.user.department ? { id: s.user.department.id, code: s.user.department.code, name: s.user.department.name } : null,
  };
}

const listQuery = pagination.extend({
  q: optionalQuery(z.string().trim().max(100)),
  programId: optionalQuery(id),
  level: optionalQuery(level),
  status: optionalQuery(z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED'])),
  departmentId: optionalQuery(id),
});

export function studentWhere(
  dept: string | undefined,
  q: z.infer<typeof listQuery>,
): Prisma.StudentWhereInput {
  return {
    programId: q.programId,
    level: q.level,
    user: { departmentId: dept, status: q.status },
    ...(q.q
      ? {
          OR: [
            { matricNo: { contains: q.q, mode: 'insensitive' } },
            { user: { firstName: { contains: q.q, mode: 'insensitive' } } },
            { user: { lastName: { contains: q.q, mode: 'insensitive' } } },
            { user: { email: { contains: q.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

studentsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const q = parse(listQuery, req.query);
  const where = studentWhere(departmentFilter(user, q.departmentId), q);

  if (csvRequested(req)) {
    const rows = await prisma.student.findMany({ where, include: studentInclude, orderBy: { matricNo: 'asc' } });
    sendCsv(
      res,
      'students.csv',
      ['Matric no.', 'First name', 'Last name', 'Email', 'Programme', 'Level', 'Entry year', 'Status'],
      rows.map((s) => [s.matricNo, s.user.firstName, s.user.lastName, s.user.email, programLabel(s.program), s.level, s.entryYear, s.user.status]),
    );
    return;
  }

  const [items, total] = await Promise.all([
    prisma.student.findMany({ where, include: studentInclude, orderBy: { matricNo: 'asc' }, ...pageArgs(q) }),
    prisma.student.count({ where }),
  ]);
  res.json({ items: items.map(formatStudent), total, page: q.page, pageSize: q.pageSize });
});

studentsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const student = await prisma.student.findUnique({ where: { userId: String(req.params.id) }, include: studentInclude });
  if (!student) throw notFound('Student');
  assertDepartmentAccess(user, student.user.departmentId!);

  const [enrollments, t] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: student.userId },
      include: { offering: { include: { course: true, semester: { include: { session: true } }, resultSheet: true } } },
    }),
    transcript(student.userId),
  ]);

  const bySemester = new Map<string, { semester: ReturnType<typeof formatSemester>; order: number; courses: unknown[]; units: number }>();
  for (const e of enrollments) {
    const s = e.offering.semester;
    const group = bySemester.get(s.id) ?? { semester: formatSemester(s), order: semesterOrder(s), courses: [], units: 0 };
    group.courses.push({
      enrollmentId: e.id,
      code: e.offering.course.code,
      title: e.offering.course.title,
      units: e.units,
      resultStatus: e.offering.resultSheet?.status ?? 'DRAFT',
    });
    group.units += e.units;
    bySemester.set(s.id, group);
  }

  res.json({
    student: formatStudent(student),
    registrations: [...bySemester.values()].sort((a, b) => b.order - a.order).map(({ order: _o, ...rest }) => rest),
    transcript: t,
  });
});

const fields = z.object({
  firstName: personName,
  lastName: personName,
  email,
  phone: optionalText(30),
  matricNo,
  programId: id,
  level,
  entryYear: z.coerce.number().int().min(1990).max(2100),
  gender: z.enum(['Female', 'Male']).nullable().optional(),
  dateOfBirth: z.iso.date('Use a valid date').nullable().optional(),
  address: optionalText(300),
});

async function loadProgram(programId: string, studentLevel?: number) {
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) throw unprocessable('Choose a valid programme.', { fields: { programId: 'Choose a valid programme' } });
  if (studentLevel && studentLevel > program.durationYears * 100) {
    throw unprocessable(`${programLabel(program)} only runs to ${program.durationYears * 100} level.`, {
      fields: { level: `Maximum is ${program.durationYears * 100} level` },
    });
  }
  return program;
}

studentsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const body = parse(fields, req.body);
  const program = await loadProgram(body.programId, body.level);
  assertDepartmentAccess(user, program.departmentId);

  const created = await prisma.$transaction(async (tx) => {
    const { user: account, tempPassword } = await createAccount(tx, {
      role: 'STUDENT',
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      departmentId: program.departmentId,
    });
    await tx.student.create({
      data: {
        userId: account.id,
        matricNo: body.matricNo,
        programId: program.id,
        level: body.level,
        entryYear: body.entryYear,
        gender: body.gender ?? null,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        address: body.address,
      },
    });
    await audit(tx, {
      actor: user,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: account.id,
      departmentId: program.departmentId,
      summary: `Student ${body.matricNo} (${body.firstName} ${body.lastName}) registered`,
      metadata: { role: 'STUDENT', matricNo: body.matricNo, programId: program.id },
      ip: clientIp(req),
    });
    return { id: account.id, tempPassword };
  });

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: created.id }, include: studentInclude });
  res.status(201).json({ student: formatStudent(student), tempPassword: created.tempPassword });
});

studentsRouter.patch('/:id', async (req, res) => {
  const user = currentUser(req);
  const studentId = String(req.params.id);
  const existing = await prisma.student.findUnique({ where: { userId: studentId }, include: studentInclude });
  if (!existing) throw notFound('Student');
  assertDepartmentAccess(user, existing.user.departmentId!);

  const body = parse(fields.partial(), req.body);
  const program = await loadProgram(body.programId ?? existing.programId, body.level ?? existing.level);
  assertDepartmentAccess(user, program.departmentId);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: studentId },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        departmentId: program.departmentId,
      },
    });
    await tx.student.update({
      where: { userId: studentId },
      data: {
        matricNo: body.matricNo,
        programId: program.id,
        level: body.level,
        entryYear: body.entryYear,
        gender: body.gender,
        dateOfBirth: body.dateOfBirth === undefined ? undefined : body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        address: body.address,
      },
    });
    await audit(tx, {
      actor: user,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: studentId,
      departmentId: program.departmentId,
      summary: `Student ${existing.matricNo} updated`,
      metadata: { changes: body },
      ip: clientIp(req),
    });
  });

  const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentId }, include: studentInclude });
  res.json({ student: formatStudent(student) });
});

studentsRouter.post('/:id/reset-password', async (req, res) => {
  res.json(await resetPassword(currentUser(req), String(req.params.id), ['STUDENT'], clientIp(req)));
});
