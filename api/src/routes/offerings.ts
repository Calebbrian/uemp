import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { formatSemester, fullName, resolveSemester, semesterLabel } from '../lib/academic';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { assertDepartmentAccess, departmentFilter } from '../lib/scope';
import { id, optionalQuery, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';

/** Course offerings: which courses run in a semester and who teaches them. */
export const offeringsRouter = Router();

const include = {
  course: { include: { department: true } },
  semester: { include: { session: true } },
  allocations: { include: { lecturer: { include: { user: true } } } },
  resultSheet: true,
  _count: { select: { enrollments: true } },
} satisfies Prisma.CourseOfferingInclude;

type OfferingRow = Prisma.CourseOfferingGetPayload<{ include: typeof include }>;

export function formatOffering(o: OfferingRow) {
  return {
    id: o.id,
    capacity: o.capacity,
    registered: o._count.enrollments,
    status: o.resultSheet?.status ?? 'DRAFT',
    course: {
      id: o.course.id,
      code: o.course.code,
      title: o.course.title,
      units: o.course.units,
      level: o.course.level,
      term: o.course.term,
      department: { id: o.course.department.id, code: o.course.department.code, name: o.course.department.name },
    },
    semester: formatSemester(o.semester),
    lecturers: o.allocations.map((a) => ({ id: a.lecturerId, name: fullName(a.lecturer.user) })),
  };
}

offeringsRouter.get('/', requirePermission('offerings.manage', 'registrations.view'), async (req, res) => {
  const user = currentUser(req);
  const q = parse(
    z.object({ semesterId: optionalQuery(id), departmentId: optionalQuery(id), q: optionalQuery(z.string().trim().max(100)) }),
    req.query,
  );
  const semester = await resolveSemester(prisma, q.semesterId);
  if (!semester) {
    res.json({ semester: null, items: [] });
    return;
  }
  const offerings = await prisma.courseOffering.findMany({
    where: {
      semesterId: semester.id,
      course: {
        departmentId: departmentFilter(user, q.departmentId),
        ...(q.q
          ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }] }
          : {}),
      },
    },
    include,
    orderBy: [{ course: { level: 'asc' } }, { course: { code: 'asc' } }],
  });
  res.json({ semester: formatSemester(semester), items: offerings.map(formatOffering) });
});

offeringsRouter.post('/', requirePermission('offerings.manage'), async (req, res) => {
  const user = currentUser(req);
  const body = parse(
    z.object({ courseId: id, semesterId: id, capacity: z.coerce.number().int().min(1).max(2000).nullable().optional() }),
    req.body,
  );
  const [course, semester] = await Promise.all([
    prisma.course.findUnique({ where: { id: body.courseId } }),
    prisma.semester.findUnique({ where: { id: body.semesterId }, include: { session: true } }),
  ]);
  if (!course) throw unprocessable('Choose a valid course.', { fields: { courseId: 'Choose a course' } });
  if (!semester) throw unprocessable('Choose a valid semester.', { fields: { semesterId: 'Choose a semester' } });
  assertDepartmentAccess(user, course.departmentId);
  if (!course.isActive) throw unprocessable(`${course.code} is inactive.`);
  if (course.term !== semester.term) {
    throw unprocessable(`${course.code} is a ${course.term.toLowerCase()} semester course and cannot run in the ${semester.term.toLowerCase()} semester.`);
  }

  const offering = await prisma.$transaction(async (tx) => {
    const created = await tx.courseOffering.create({
      data: { courseId: course.id, semesterId: semester.id, capacity: body.capacity ?? null, resultSheet: { create: {} } },
    });
    await audit(tx, {
      actor: user,
      action: 'OFFERING_CREATED',
      entityType: 'CourseOffering',
      entityId: created.id,
      departmentId: course.departmentId,
      summary: `${course.code} offered in ${semesterLabel(semester)}`,
      ip: clientIp(req),
    });
    return tx.courseOffering.findUniqueOrThrow({ where: { id: created.id }, include });
  });
  res.status(201).json({ offering: formatOffering(offering) });
});

async function loadScoped(offeringId: string, user: ReturnType<typeof currentUser>) {
  const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId }, include });
  if (!offering) throw notFound('Course offering');
  assertDepartmentAccess(user, offering.course.departmentId);
  return offering;
}

offeringsRouter.patch('/:id', requirePermission('offerings.manage'), async (req, res) => {
  const user = currentUser(req);
  const offering = await loadScoped(String(req.params.id), user);
  const body = parse(z.object({ capacity: z.coerce.number().int().min(1).max(2000).nullable() }), req.body);
  if (body.capacity !== null && body.capacity < offering._count.enrollments) {
    throw conflict(`${offering._count.enrollments} students are already registered, so capacity cannot be lower.`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.courseOffering.update({ where: { id: offering.id }, data: { capacity: body.capacity } });
    await audit(tx, {
      actor: user,
      action: 'OFFERING_UPDATED',
      entityType: 'CourseOffering',
      entityId: offering.id,
      departmentId: offering.course.departmentId,
      summary: `${offering.course.code} capacity set to ${body.capacity ?? 'unlimited'}`,
      ip: clientIp(req),
    });
    return tx.courseOffering.findUniqueOrThrow({ where: { id: offering.id }, include });
  });
  res.json({ offering: formatOffering(updated) });
});

/**
 * Lecturers can only be allocated to courses in their own department, which
 * is what keeps a lecturer from touching another department's results.
 */
offeringsRouter.put('/:id/lecturers', requirePermission('offerings.manage'), async (req, res) => {
  const user = currentUser(req);
  const offering = await loadScoped(String(req.params.id), user);
  const body = parse(z.object({ lecturerIds: z.array(id).max(10) }), req.body);
  const ids = [...new Set(body.lecturerIds)];

  const lecturers = await prisma.lecturer.findMany({ where: { userId: { in: ids } }, include: { user: true } });
  if (lecturers.length !== ids.length) throw unprocessable('One or more lecturers could not be found.');
  const outside = lecturers.filter((l) => l.user.departmentId !== offering.course.departmentId);
  if (outside.length) {
    throw unprocessable(`${outside.map((l) => fullName(l.user)).join(', ')} is not in the ${offering.course.department.name} department.`);
  }
  const inactive = lecturers.filter((l) => l.user.status !== 'ACTIVE');
  if (inactive.length) throw unprocessable(`${inactive.map((l) => fullName(l.user)).join(', ')} is not an active account.`);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.courseAllocation.deleteMany({ where: { offeringId: offering.id, lecturerId: { notIn: ids } } });
    await tx.courseAllocation.createMany({
      data: ids.map((lecturerId) => ({ offeringId: offering.id, lecturerId })),
      skipDuplicates: true,
    });
    await audit(tx, {
      actor: user,
      action: 'LECTURERS_ASSIGNED',
      entityType: 'CourseOffering',
      entityId: offering.id,
      departmentId: offering.course.departmentId,
      summary: `${offering.course.code}: ${lecturers.map((l) => fullName(l.user)).join(', ') || 'no lecturers'}`,
      metadata: {
        before: offering.allocations.map((a) => fullName(a.lecturer.user)),
        after: lecturers.map((l) => fullName(l.user)),
      },
      ip: clientIp(req),
    });
    return tx.courseOffering.findUniqueOrThrow({ where: { id: offering.id }, include });
  });
  res.json({ offering: formatOffering(updated) });
});

offeringsRouter.delete('/:id', requirePermission('offerings.manage'), async (req, res) => {
  const user = currentUser(req);
  const offering = await loadScoped(String(req.params.id), user);
  if (offering._count.enrollments) {
    throw conflict(`${offering._count.enrollments} students are registered for ${offering.course.code}, so it cannot be removed.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.resultSheet.deleteMany({ where: { offeringId: offering.id } });
    await tx.courseAllocation.deleteMany({ where: { offeringId: offering.id } });
    await tx.courseOffering.delete({ where: { id: offering.id } });
    await audit(tx, {
      actor: user,
      action: 'OFFERING_DELETED',
      entityType: 'CourseOffering',
      entityId: offering.id,
      departmentId: offering.course.departmentId,
      summary: `${offering.course.code} removed from ${semesterLabel(offering.semester)}`,
      ip: clientIp(req),
    });
  });
  res.json({ ok: true });
});
