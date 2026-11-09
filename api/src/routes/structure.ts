import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { fullName } from '../lib/academic';
import { conflict, notFound } from '../lib/errors';
import { id, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';

/** Faculties and departments. Readable by any admin, managed by the super admin. */
export const structureRouter = Router();

const readers = requirePermission('students.manage', 'faculties.manage');
const managers = requirePermission('faculties.manage');

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,6}$/, 'Use 2–6 letters, e.g. CSC');
const name = z.string().trim().min(2, 'Required').max(120);

structureRouter.get('/faculties', readers, async (_req, res) => {
  const faculties = await prisma.faculty.findMany({
    include: { departments: { include: { _count: { select: { users: { where: { role: 'STUDENT' } } } } } } },
    orderBy: { name: 'asc' },
  });
  res.json({
    items: faculties.map((f) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      departments: f.departments.length,
      students: f.departments.reduce((sum, d) => sum + d._count.users, 0),
      createdAt: f.createdAt,
    })),
  });
});

structureRouter.post('/faculties', managers, async (req, res) => {
  const body = parse(z.object({ name, code }), req.body);
  const faculty = await prisma.$transaction(async (tx) => {
    const created = await tx.faculty.create({ data: body });
    await audit(tx, {
      actor: currentUser(req),
      action: 'FACULTY_CREATED',
      entityType: 'Faculty',
      entityId: created.id,
      summary: `Faculty ${created.name} (${created.code}) created`,
      ip: clientIp(req),
    });
    return created;
  });
  res.status(201).json({ faculty });
});

structureRouter.patch('/faculties/:id', managers, async (req, res) => {
  const body = parse(z.object({ name, code }).partial(), req.body);
  const faculty = await prisma.$transaction(async (tx) => {
    const updated = await tx.faculty.update({ where: { id: String(req.params.id) }, data: body });
    await audit(tx, {
      actor: currentUser(req),
      action: 'FACULTY_UPDATED',
      entityType: 'Faculty',
      entityId: updated.id,
      summary: `Faculty ${updated.name} updated`,
      metadata: { changes: body },
      ip: clientIp(req),
    });
    return updated;
  });
  res.json({ faculty });
});

structureRouter.delete('/faculties/:id', managers, async (req, res) => {
  const faculty = await prisma.faculty.findUnique({
    where: { id: String(req.params.id) },
    include: { _count: { select: { departments: true } } },
  });
  if (!faculty) throw notFound('Faculty');
  if (faculty._count.departments > 0) {
    throw conflict(
      `${faculty.name} still has ${faculty._count.departments} department${faculty._count.departments === 1 ? '' : 's'}. Move or delete them first.`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.faculty.delete({ where: { id: faculty.id } });
    await audit(tx, {
      actor: currentUser(req),
      action: 'FACULTY_DELETED',
      entityType: 'Faculty',
      entityId: faculty.id,
      summary: `Faculty ${faculty.name} deleted`,
      ip: clientIp(req),
    });
  });
  res.json({ ok: true });
});

structureRouter.get('/departments', readers, async (req, res) => {
  const facultyId = typeof req.query.facultyId === 'string' && req.query.facultyId ? req.query.facultyId : undefined;
  const departments = await prisma.department.findMany({
    where: { facultyId },
    include: {
      faculty: true,
      users: { where: { role: 'DEPT_ADMIN' } },
      _count: { select: { courses: true, programs: true } },
    },
    orderBy: { name: 'asc' },
  });
  const counts = await prisma.user.groupBy({
    by: ['departmentId', 'role'],
    where: { role: { in: ['STUDENT', 'LECTURER'] } },
    _count: { _all: true },
  });
  const countFor = (deptId: string, role: string) =>
    counts.find((c) => c.departmentId === deptId && c.role === role)?._count._all ?? 0;

  res.json({
    items: departments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      faculty: { id: d.faculty.id, code: d.faculty.code, name: d.faculty.name },
      students: countFor(d.id, 'STUDENT'),
      lecturers: countFor(d.id, 'LECTURER'),
      courses: d._count.courses,
      programs: d._count.programs,
      admins: d.users.map((u) => ({ id: u.id, name: fullName(u), email: u.email })),
    })),
  });
});

structureRouter.post('/departments', managers, async (req, res) => {
  const body = parse(z.object({ name, code, facultyId: id }), req.body);
  const department = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({ data: body });
    await audit(tx, {
      actor: currentUser(req),
      action: 'DEPARTMENT_CREATED',
      entityType: 'Department',
      entityId: created.id,
      summary: `Department ${created.name} (${created.code}) created`,
      ip: clientIp(req),
    });
    return created;
  });
  res.status(201).json({ department });
});

structureRouter.patch('/departments/:id', managers, async (req, res) => {
  const body = parse(z.object({ name, code, facultyId: id }).partial(), req.body);
  const department = await prisma.$transaction(async (tx) => {
    const updated = await tx.department.update({ where: { id: String(req.params.id) }, data: body });
    await audit(tx, {
      actor: currentUser(req),
      action: 'DEPARTMENT_UPDATED',
      entityType: 'Department',
      entityId: updated.id,
      summary: `Department ${updated.name} updated`,
      metadata: { changes: body },
      ip: clientIp(req),
    });
    return updated;
  });
  res.json({ department });
});

structureRouter.delete('/departments/:id', managers, async (req, res) => {
  const department = await prisma.department.findUnique({
    where: { id: String(req.params.id) },
    include: { _count: { select: { users: true, courses: true, programs: true, auditLogs: true } } },
  });
  if (!department) throw notFound('Department');
  const { users, courses, programs } = department._count;
  if (users + courses + programs > 0) {
    throw conflict(`${department.name} still has users, programmes or courses. Remove them first.`);
  }
  if (department._count.auditLogs > 0) {
    throw conflict(`${department.name} has audit history and cannot be deleted.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.department.delete({ where: { id: department.id } });
    await audit(tx, {
      actor: currentUser(req),
      action: 'DEPARTMENT_DELETED',
      entityType: 'Department',
      entityId: department.id,
      summary: `Department ${department.name} deleted`,
      ip: clientIp(req),
    });
  });
  res.json({ ok: true });
});
