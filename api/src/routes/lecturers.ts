import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { formatSemester, fullName, getCurrentSemester, semesterOrder } from '../lib/academic';
import { notFound } from '../lib/errors';
import { assertDepartmentAccess, departmentFilter, targetDepartment } from '../lib/scope';
import { email, id, optionalQuery, optionalText, pageArgs, pagination, parse, personName } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';
import { createAccount, resetPassword } from '../services/accounts';

export const lecturersRouter = Router();
lecturersRouter.use(requirePermission('lecturers.manage'));

const include = { user: { include: { department: true } } } satisfies Prisma.LecturerInclude;
type LecturerRow = Prisma.LecturerGetPayload<{ include: typeof include }>;

function formatLecturer(l: LecturerRow, currentCourses: string[] = []) {
  return {
    id: l.userId,
    staffId: l.staffId,
    rank: l.rank,
    title: l.user.title,
    firstName: l.user.firstName,
    lastName: l.user.lastName,
    name: fullName(l.user),
    email: l.user.email,
    phone: l.user.phone,
    status: l.user.status,
    lastLoginAt: l.user.lastLoginAt,
    department: l.user.department ? { id: l.user.department.id, code: l.user.department.code, name: l.user.department.name } : null,
    currentCourses,
  };
}

const listQuery = pagination.extend({
  q: optionalQuery(z.string().trim().max(100)),
  status: optionalQuery(z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED'])),
  departmentId: optionalQuery(id),
});

lecturersRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const q = parse(listQuery, req.query);
  const where: Prisma.LecturerWhereInput = {
    user: { departmentId: departmentFilter(user, q.departmentId), status: q.status },
    ...(q.q
      ? {
          OR: [
            { staffId: { contains: q.q, mode: 'insensitive' } },
            { user: { firstName: { contains: q.q, mode: 'insensitive' } } },
            { user: { lastName: { contains: q.q, mode: 'insensitive' } } },
            { user: { email: { contains: q.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const semester = await getCurrentSemester(prisma);
  const [items, total] = await Promise.all([
    prisma.lecturer.findMany({
      where,
      include: {
        ...include,
        allocations: { where: { offering: { semesterId: semester?.id ?? '' } }, include: { offering: { include: { course: true } } } },
      },
      orderBy: { user: { lastName: 'asc' } },
      ...pageArgs(q),
    }),
    prisma.lecturer.count({ where }),
  ]);
  res.json({
    items: items.map((l) => formatLecturer(l, l.allocations.map((a) => a.offering.course.code).sort())),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

lecturersRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const lecturer = await prisma.lecturer.findUnique({
    where: { userId: String(req.params.id) },
    include: {
      ...include,
      allocations: {
        include: {
          offering: {
            include: { course: true, semester: { include: { session: true } }, resultSheet: true, _count: { select: { enrollments: true } } },
          },
        },
      },
    },
  });
  if (!lecturer) throw notFound('Lecturer');
  assertDepartmentAccess(user, lecturer.user.departmentId!);

  const groups = new Map<string, { semester: ReturnType<typeof formatSemester>; order: number; courses: unknown[] }>();
  for (const a of lecturer.allocations) {
    const s = a.offering.semester;
    const group = groups.get(s.id) ?? { semester: formatSemester(s), order: semesterOrder(s), courses: [] };
    group.courses.push({
      offeringId: a.offering.id,
      code: a.offering.course.code,
      title: a.offering.course.title,
      units: a.offering.course.units,
      students: a.offering._count.enrollments,
      status: a.offering.resultSheet?.status ?? 'DRAFT',
    });
    groups.set(s.id, group);
  }
  res.json({
    lecturer: formatLecturer(lecturer),
    allocations: [...groups.values()].sort((a, b) => b.order - a.order).map(({ order: _o, ...rest }) => rest),
  });
});

const fields = z.object({
  title: optionalText(20),
  firstName: personName,
  lastName: personName,
  email,
  phone: optionalText(30),
  staffId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9/-]{3,20}$/, 'Use letters, numbers and / only, e.g. STF/CSC/004'),
  rank: optionalText(60),
  departmentId: id.optional(),
});

lecturersRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const body = parse(fields, req.body);
  const departmentId = targetDepartment(user, body.departmentId);

  const created = await prisma.$transaction(async (tx) => {
    const { user: account, tempPassword } = await createAccount(tx, { role: 'LECTURER', ...body, departmentId });
    await tx.lecturer.create({ data: { userId: account.id, staffId: body.staffId, rank: body.rank } });
    await audit(tx, {
      actor: user,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: account.id,
      departmentId,
      summary: `Lecturer ${fullName(body)} (${body.staffId}) created`,
      metadata: { role: 'LECTURER', staffId: body.staffId },
      ip: clientIp(req),
    });
    return { id: account.id, tempPassword };
  });

  const lecturer = await prisma.lecturer.findUniqueOrThrow({ where: { userId: created.id }, include });
  res.status(201).json({ lecturer: formatLecturer(lecturer), tempPassword: created.tempPassword });
});

lecturersRouter.patch('/:id', async (req, res) => {
  const user = currentUser(req);
  const lecturerId = String(req.params.id);
  const existing = await prisma.lecturer.findUnique({ where: { userId: lecturerId }, include });
  if (!existing) throw notFound('Lecturer');
  assertDepartmentAccess(user, existing.user.departmentId!);

  const body = parse(fields.partial(), req.body);
  const departmentId = body.departmentId ? targetDepartment(user, body.departmentId) : existing.user.departmentId;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: lecturerId },
      data: {
        title: body.title,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        departmentId,
      },
    });
    await tx.lecturer.update({ where: { userId: lecturerId }, data: { staffId: body.staffId, rank: body.rank } });
    await audit(tx, {
      actor: user,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: lecturerId,
      departmentId,
      summary: `Lecturer ${existing.staffId} updated`,
      metadata: { changes: body },
      ip: clientIp(req),
    });
  });

  const lecturer = await prisma.lecturer.findUniqueOrThrow({ where: { userId: lecturerId }, include });
  res.json({ lecturer: formatLecturer(lecturer) });
});

lecturersRouter.post('/:id/reset-password', async (req, res) => {
  res.json(await resetPassword(currentUser(req), String(req.params.id), ['LECTURER'], clientIp(req)));
});
