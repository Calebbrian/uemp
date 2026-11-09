import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { conflict, notFound } from '../lib/errors';
import { assertDepartmentAccess, departmentFilter, targetDepartment } from '../lib/scope';
import { id, level, optionalQuery, optionalText, pageArgs, pagination, parse, term } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';

export const coursesRouter = Router();
coursesRouter.use(requirePermission('courses.manage'));

const courseCode = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/\s+/g, ' ').replace(/^([A-Z]{3})(\d{3})$/, '$1 $2'))
  .pipe(z.string().regex(/^[A-Z]{3} \d{3}$/, 'Use the format CSC 201'));

const fields = z.object({
  code: courseCode,
  title: z.string().trim().min(3, 'Required').max(150),
  units: z.coerce.number().int().min(1, 'At least 1 unit').max(6, 'At most 6 units'),
  level,
  term,
  description: optionalText(1000),
  isActive: z.boolean().default(true),
  departmentId: id.optional(),
});

const listQuery = pagination.extend({
  q: optionalQuery(z.string().trim().max(100)),
  level: optionalQuery(level),
  term: optionalQuery(term),
  active: optionalQuery(z.enum(['true', 'false'])),
  departmentId: optionalQuery(id),
});

coursesRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const q = parse(listQuery, req.query);
  const where: Prisma.CourseWhereInput = {
    departmentId: departmentFilter(user, q.departmentId),
    level: q.level,
    term: q.term,
    isActive: q.active === undefined ? undefined : q.active === 'true',
    ...(q.q
      ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      include: { department: true, programs: { include: { program: true } }, _count: { select: { offerings: true } } },
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
      ...pageArgs(q),
    }),
    prisma.course.count({ where }),
  ]);
  res.json({
    items: items.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      units: c.units,
      level: c.level,
      term: c.term,
      description: c.description,
      isActive: c.isActive,
      offerings: c._count.offerings,
      department: { id: c.department.id, code: c.department.code, name: c.department.name },
      programs: c.programs.map((p) => ({ id: p.programId, code: p.program.code, isCore: p.isCore })),
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  });
});

/**
 * Every active course in the university, for the curriculum picker. Only the
 * code, title and placement are exposed, so this is safe across departments.
 */
coursesRouter.get('/catalog', requirePermission('programs.manage'), async (_req, res) => {
  const courses = await prisma.course.findMany({
    where: { isActive: true },
    include: { department: true },
    orderBy: { code: 'asc' },
  });
  res.json({
    items: courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      units: c.units,
      level: c.level,
      term: c.term,
      department: c.department.code,
    })),
  });
});

coursesRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const body = parse(fields, req.body);
  const departmentId = targetDepartment(user, body.departmentId);
  const course = await prisma.$transaction(async (tx) => {
    const created = await tx.course.create({ data: { ...body, departmentId } });
    await audit(tx, {
      actor: user,
      action: 'COURSE_CREATED',
      entityType: 'Course',
      entityId: created.id,
      departmentId,
      summary: `Course ${created.code} ${created.title} created`,
      ip: clientIp(req),
    });
    return created;
  });
  res.status(201).json({ course });
});

coursesRouter.patch('/:id', async (req, res) => {
  const user = currentUser(req);
  const existing = await prisma.course.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound('Course');
  assertDepartmentAccess(user, existing.departmentId);
  const body = parse(fields.partial(), req.body);
  if (body.departmentId && body.departmentId !== existing.departmentId) targetDepartment(user, body.departmentId);

  if ((body.term && body.term !== existing.term) || (body.level && body.level !== existing.level)) {
    const offered = await prisma.courseOffering.count({ where: { courseId: existing.id } });
    if (offered) throw conflict('This course has already been offered, so its level and semester cannot change.');
  }

  const course = await prisma.$transaction(async (tx) => {
    const updated = await tx.course.update({ where: { id: existing.id }, data: body });
    await audit(tx, {
      actor: user,
      action: 'COURSE_UPDATED',
      entityType: 'Course',
      entityId: updated.id,
      departmentId: updated.departmentId,
      summary: `Course ${updated.code} updated`,
      metadata: { changes: body },
      ip: clientIp(req),
    });
    return updated;
  });
  res.json({ course });
});

coursesRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  const course = await prisma.course.findUnique({
    where: { id: String(req.params.id) },
    include: { _count: { select: { offerings: true } } },
  });
  if (!course) throw notFound('Course');
  assertDepartmentAccess(user, course.departmentId);
  if (course._count.offerings) throw conflict(`${course.code} has been offered before. Mark it inactive instead.`);

  await prisma.$transaction(async (tx) => {
    await tx.programCourse.deleteMany({ where: { courseId: course.id } });
    await tx.course.delete({ where: { id: course.id } });
    await audit(tx, {
      actor: user,
      action: 'COURSE_DELETED',
      entityType: 'Course',
      entityId: course.id,
      departmentId: course.departmentId,
      summary: `Course ${course.code} deleted`,
      ip: clientIp(req),
    });
  });
  res.json({ ok: true });
});
