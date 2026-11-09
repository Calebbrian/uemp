import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { semesterLabel, termLabel } from '../lib/academic';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { parse } from '../lib/validate';
import { currentUser, requireAuth, requirePermission } from '../middleware/auth';

export const sessionsRouter = Router();

const sessionFields = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/, 'Use the format 2026/2027')
      .refine((n) => Number(n.slice(5)) === Number(n.slice(0, 4)) + 1, 'The second year must follow the first'),
    startDate: z.iso.date('Use a valid date'),
    endDate: z.iso.date('Use a valid date'),
  })
  .refine((s) => s.endDate > s.startDate, { path: ['endDate'], message: 'End date must be after the start date' });

sessionsRouter.get('/', requireAuth, async (_req, res) => {
  const sessions = await prisma.academicSession.findMany({
    include: {
      semesters: {
        include: { _count: { select: { offerings: true } } },
        orderBy: { term: 'asc' },
      },
    },
    orderBy: { startDate: 'desc' },
  });
  const counts = await prisma.$queryRaw<{ semesterId: string; count: bigint }[]>`
    SELECT o."semesterId", COUNT(*) AS count
    FROM "Enrollment" e JOIN "CourseOffering" o ON o.id = e."offeringId"
    GROUP BY o."semesterId"`;
  const regCount = new Map(counts.map((c) => [c.semesterId, Number(c.count)]));

  res.json({
    items: sessions.map((s) => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      isCurrent: s.semesters.some((sem) => sem.isCurrent),
      semesters: s.semesters.map((sem) => ({
        id: sem.id,
        term: sem.term,
        label: termLabel(sem.term),
        isCurrent: sem.isCurrent,
        registrationOpen: sem.registrationOpen,
        offerings: sem._count.offerings,
        registrations: regCount.get(sem.id) ?? 0,
      })),
    })),
  });
});

sessionsRouter.post('/', requirePermission('sessions.manage'), async (req, res) => {
  const user = currentUser(req);
  const body = parse(sessionFields, req.body);
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.academicSession.create({
      data: {
        name: body.name,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        semesters: { create: [{ term: 'FIRST' }, { term: 'SECOND' }] },
      },
    });
    await audit(tx, {
      actor: user,
      action: 'SESSION_CREATED',
      entityType: 'AcademicSession',
      entityId: created.id,
      summary: `Session ${created.name} created with first and second semesters`,
      ip: clientIp(req),
    });
    return created;
  });
  res.status(201).json({ session });
});

sessionsRouter.patch('/:id', requirePermission('sessions.manage'), async (req, res) => {
  const user = currentUser(req);
  const body = parse(sessionFields, req.body);
  const session = await prisma.$transaction(async (tx) => {
    const updated = await tx.academicSession.update({
      where: { id: String(req.params.id) },
      data: { name: body.name, startDate: new Date(body.startDate), endDate: new Date(body.endDate) },
    });
    await audit(tx, {
      actor: user,
      action: 'SESSION_UPDATED',
      entityType: 'AcademicSession',
      entityId: updated.id,
      summary: `Session ${updated.name} updated`,
      metadata: { changes: body },
      ip: clientIp(req),
    });
    return updated;
  });
  res.json({ session });
});

/** Exactly one semester is current. Switching closes registration everywhere else. */
sessionsRouter.post('/semesters/:id/current', requirePermission('sessions.manage'), async (req, res) => {
  const user = currentUser(req);
  const semester = await prisma.semester.findUnique({ where: { id: String(req.params.id) }, include: { session: true } });
  if (!semester) throw notFound('Semester');
  if (semester.isCurrent) throw conflict(`${semesterLabel(semester)} is already the current semester.`);

  const previous = await prisma.semester.findFirst({ where: { isCurrent: true }, include: { session: true } });
  await prisma.$transaction(async (tx) => {
    await tx.semester.updateMany({ where: { id: { not: semester.id } }, data: { isCurrent: false, registrationOpen: false } });
    await tx.semester.update({ where: { id: semester.id }, data: { isCurrent: true } });
    await audit(tx, {
      actor: user,
      action: 'SEMESTER_SET_CURRENT',
      entityType: 'Semester',
      entityId: semester.id,
      summary: `Current semester changed to ${semesterLabel(semester)}`,
      metadata: { previous: previous ? semesterLabel(previous) : null },
      ip: clientIp(req),
    });
  });
  res.json({ ok: true });
});

sessionsRouter.post('/semesters/:id/registration', requirePermission('sessions.manage'), async (req, res) => {
  const user = currentUser(req);
  const body = parse(z.object({ open: z.boolean() }), req.body);
  const semester = await prisma.semester.findUnique({ where: { id: String(req.params.id) }, include: { session: true } });
  if (!semester) throw notFound('Semester');
  if (body.open && !semester.isCurrent) {
    throw unprocessable('Registration can only be opened for the current semester.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.semester.update({ where: { id: semester.id }, data: { registrationOpen: body.open } });
    await audit(tx, {
      actor: user,
      action: body.open ? 'REGISTRATION_OPENED' : 'REGISTRATION_CLOSED',
      entityType: 'Semester',
      entityId: semester.id,
      summary: `Registration ${body.open ? 'opened' : 'closed'} for ${semesterLabel(semester)}`,
      ip: clientIp(req),
    });
  });
  res.json({ ok: true });
});
