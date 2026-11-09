import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { programLabel } from '../lib/academic';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { assertDepartmentAccess, departmentFilter, targetDepartment } from '../lib/scope';
import { id, optionalQuery, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';

export const programsRouter = Router();
programsRouter.use(requirePermission('programs.manage'));

const fields = z.object({
  name: z.string().trim().min(2, 'Required').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,20}$/, 'Use letters, numbers and dashes, e.g. BSC-CSC'),
  award: z.string().trim().min(2, 'Required').max(20),
  durationYears: z.coerce.number().int().min(1).max(6),
  departmentId: id.optional(),
});

programsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const q = parse(z.object({ departmentId: optionalQuery(id) }), req.query);
  const programs = await prisma.program.findMany({
    where: { departmentId: departmentFilter(user, q.departmentId) },
    include: { department: true, _count: { select: { students: true, curriculum: true } } },
    orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
  });
  res.json({
    items: programs.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      label: programLabel(p),
      award: p.award,
      durationYears: p.durationYears,
      students: p._count.students,
      courses: p._count.curriculum,
      department: { id: p.department.id, code: p.department.code, name: p.department.name },
    })),
  });
});

programsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const program = await prisma.program.findUnique({
    where: { id: String(req.params.id) },
    include: {
      department: true,
      curriculum: { include: { course: { include: { department: true } } } },
      _count: { select: { students: true } },
    },
  });
  if (!program) throw notFound('Programme');
  assertDepartmentAccess(user, program.departmentId);

  const courses = program.curriculum
    .map((pc) => ({
      courseId: pc.courseId,
      code: pc.course.code,
      title: pc.course.title,
      units: pc.course.units,
      level: pc.course.level,
      term: pc.course.term,
      isCore: pc.isCore,
      isActive: pc.course.isActive,
      department: pc.course.department.code,
    }))
    .sort((a, b) => a.level - b.level || a.term.localeCompare(b.term) || a.code.localeCompare(b.code));

  res.json({
    program: {
      id: program.id,
      code: program.code,
      name: program.name,
      label: programLabel(program),
      award: program.award,
      durationYears: program.durationYears,
      students: program._count.students,
      department: { id: program.department.id, code: program.department.code, name: program.department.name },
    },
    curriculum: courses,
  });
});

programsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const body = parse(fields, req.body);
  const departmentId = targetDepartment(user, body.departmentId);
  const program = await prisma.$transaction(async (tx) => {
    const created = await tx.program.create({ data: { ...body, departmentId } });
    await audit(tx, {
      actor: user,
      action: 'PROGRAM_CREATED',
      entityType: 'Program',
      entityId: created.id,
      departmentId,
      summary: `Programme ${programLabel(created)} created`,
      ip: clientIp(req),
    });
    return created;
  });
  res.status(201).json({ program });
});

programsRouter.patch('/:id', async (req, res) => {
  const user = currentUser(req);
  const existing = await prisma.program.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound('Programme');
  assertDepartmentAccess(user, existing.departmentId);
  const body = parse(fields.partial(), req.body);
  if (body.departmentId && body.departmentId !== existing.departmentId) targetDepartment(user, body.departmentId);

  if (body.durationYears && body.durationYears < existing.durationYears) {
    const maxLevel = body.durationYears * 100;
    const above = await prisma.student.count({ where: { programId: existing.id, level: { gt: maxLevel } } });
    if (above) throw conflict(`${above} student(s) are above ${maxLevel} level, so the duration cannot be shortened.`);
  }

  const program = await prisma.$transaction(async (tx) => {
    const updated = await tx.program.update({ where: { id: existing.id }, data: body });
    await audit(tx, {
      actor: user,
      action: 'PROGRAM_UPDATED',
      entityType: 'Program',
      entityId: updated.id,
      departmentId: updated.departmentId,
      summary: `Programme ${programLabel(updated)} updated`,
      metadata: { changes: body },
      ip: clientIp(req),
    });
    return updated;
  });
  res.json({ program });
});

programsRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  const program = await prisma.program.findUnique({
    where: { id: String(req.params.id) },
    include: { _count: { select: { students: true } } },
  });
  if (!program) throw notFound('Programme');
  assertDepartmentAccess(user, program.departmentId);
  if (program._count.students) throw conflict(`${programLabel(program)} still has ${program._count.students} students.`);

  await prisma.$transaction(async (tx) => {
    await tx.programCourse.deleteMany({ where: { programId: program.id } });
    await tx.program.delete({ where: { id: program.id } });
    await audit(tx, {
      actor: user,
      action: 'PROGRAM_DELETED',
      entityType: 'Program',
      entityId: program.id,
      departmentId: program.departmentId,
      summary: `Programme ${programLabel(program)} deleted`,
      ip: clientIp(req),
    });
  });
  res.json({ ok: true });
});

/** A department's programme may include courses owned by other departments (e.g. MTH 201). */
programsRouter.post('/:id/courses', async (req, res) => {
  const user = currentUser(req);
  const body = parse(z.object({ courseId: id, isCore: z.boolean().default(true) }), req.body);
  const program = await prisma.program.findUnique({ where: { id: String(req.params.id) } });
  if (!program) throw notFound('Programme');
  assertDepartmentAccess(user, program.departmentId);

  const course = await prisma.course.findUnique({ where: { id: body.courseId } });
  if (!course) throw unprocessable('Choose a valid course.');
  if (course.level > program.durationYears * 100) {
    throw unprocessable(`${course.code} is a ${course.level} level course but ${programLabel(program)} ends at ${program.durationYears * 100} level.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.programCourse.upsert({
      where: { programId_courseId: { programId: program.id, courseId: course.id } },
      create: { programId: program.id, courseId: course.id, isCore: body.isCore },
      update: { isCore: body.isCore },
    });
    await audit(tx, {
      actor: user,
      action: 'CURRICULUM_UPDATED',
      entityType: 'Program',
      entityId: program.id,
      departmentId: program.departmentId,
      summary: `${course.code} added to ${programLabel(program)} as ${body.isCore ? 'core' : 'elective'}`,
      ip: clientIp(req),
    });
  });
  res.status(201).json({ ok: true });
});

programsRouter.delete('/:id/courses/:courseId', async (req, res) => {
  const user = currentUser(req);
  const program = await prisma.program.findUnique({ where: { id: String(req.params.id) } });
  if (!program) throw notFound('Programme');
  assertDepartmentAccess(user, program.departmentId);
  const courseId = String(req.params.courseId);

  await prisma.$transaction(async (tx) => {
    const removed = await tx.programCourse.deleteMany({ where: { programId: program.id, courseId } });
    if (!removed.count) throw notFound('Curriculum entry');
    const course = await tx.course.findUnique({ where: { id: courseId } });
    await audit(tx, {
      actor: user,
      action: 'CURRICULUM_UPDATED',
      entityType: 'Program',
      entityId: program.id,
      departmentId: program.departmentId,
      summary: `${course?.code ?? 'Course'} removed from ${programLabel(program)}`,
      ip: clientIp(req),
    });
  });
  res.json({ ok: true });
});
