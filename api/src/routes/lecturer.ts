import { Router } from 'express';
import { z } from 'zod';
import { rules } from '../config';
import { prisma } from '../db';
import { AUDIT_ACTIONS, clientIp } from '../lib/audit';
import { formatSemester, fullName, resolveSemester } from '../lib/academic';
import { id, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';
import { assertCanViewSheet, saveScores, sheetDetail, submitSheet } from '../services/results';

/** Lecturers only ever see offerings they are allocated to. */
export const lecturerRouter = Router();
lecturerRouter.use(requirePermission('teaching.view'));

async function assignedOfferings(lecturerId: string, semesterId: string) {
  const offerings = await prisma.courseOffering.findMany({
    where: { semesterId, allocations: { some: { lecturerId } } },
    include: {
      course: { include: { department: true } },
      resultSheet: true,
      _count: { select: { enrollments: true } },
    },
    orderBy: { course: { code: 'asc' } },
  });
  return offerings.map((o) => ({
    id: o.id,
    code: o.course.code,
    title: o.course.title,
    units: o.course.units,
    level: o.course.level,
    department: o.course.department.code,
    students: o._count.enrollments,
    status: o.resultSheet?.status ?? 'DRAFT',
    reviewComment: o.resultSheet?.reviewComment ?? null,
    reviewedAt: o.resultSheet?.reviewedAt ?? null,
    submittedAt: o.resultSheet?.submittedAt ?? null,
  }));
}

lecturerRouter.get('/dashboard', async (req, res) => {
  const me = currentUser(req);
  const semester = await resolveSemester(prisma);
  const courses = semester ? await assignedOfferings(me.id, semester.id) : [];
  const recent = await prisma.auditLog.findMany({
    where: {
      entityType: 'ResultSheet',
      entityId: { in: courses.map((c) => c.id) },
      action: { in: ['RESULT_APPROVED', 'RESULT_REJECTED', 'RESULT_REOPENED'] },
    },
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  res.json({
    semester: formatSemester(semester),
    stats: {
      courses: courses.length,
      students: courses.reduce((sum, c) => sum + c.students, 0),
      pendingSubmission: courses.filter((c) => c.status === 'DRAFT' || c.status === 'REJECTED').length,
      returned: courses.filter((c) => c.status === 'REJECTED').length,
    },
    needsAttention: courses.filter((c) => c.status === 'REJECTED' || c.status === 'DRAFT'),
    courses,
    recentReviews: recent.map((r) => ({
      id: r.id,
      label: AUDIT_ACTIONS[r.action as keyof typeof AUDIT_ACTIONS] ?? r.action,
      summary: r.summary,
      actor: r.actor ? fullName(r.actor) : null,
      createdAt: r.createdAt,
    })),
  });
});

lecturerRouter.get('/offerings', async (req, res) => {
  const me = currentUser(req);
  const query = parse(z.object({ semesterId: id.optional() }), req.query);
  const semester = await resolveSemester(prisma, query.semesterId);
  res.json({
    semester: formatSemester(semester),
    items: semester ? await assignedOfferings(me.id, semester.id) : [],
  });
});

lecturerRouter.get('/offerings/:offeringId', async (req, res) => {
  const offeringId = String(req.params.offeringId);
  await assertCanViewSheet(currentUser(req), offeringId);
  res.json(await sheetDetail(offeringId));
});

const score = (max: number, label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} cannot be more than ${max}`)
    .nullable();

const scoresSchema = z.object({
  scores: z
    .array(
      z.object({
        enrollmentId: id,
        caScore: score(rules.caMax, 'CA'),
        examScore: score(rules.examMax, 'Exam'),
      }),
    )
    .min(1)
    .max(2000),
});

lecturerRouter.put('/offerings/:offeringId/scores', requirePermission('scores.enter'), async (req, res) => {
  const body = parse(scoresSchema, req.body);
  const offeringId = String(req.params.offeringId);
  const result = await saveScores(currentUser(req), offeringId, body.scores, clientIp(req));
  res.json({ ...result, sheet: await sheetDetail(offeringId) });
});

lecturerRouter.post('/offerings/:offeringId/submit', requirePermission('scores.enter'), async (req, res) => {
  const offeringId = String(req.params.offeringId);
  await submitSheet(currentUser(req), offeringId, clientIp(req));
  res.json(await sheetDetail(offeringId));
});

lecturerRouter.get('/activity', async (req, res) => {
  const me = currentUser(req);
  const myOfferings = await prisma.courseAllocation.findMany({ where: { lecturerId: me.id }, select: { offeringId: true } });
  const entries = await prisma.auditLog.findMany({
    where: {
      OR: [
        { actorId: me.id },
        { entityType: 'ResultSheet', entityId: { in: myOfferings.map((o) => o.offeringId) } },
      ],
    },
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({
    items: entries.map((e) => ({
      id: e.id,
      action: e.action,
      label: AUDIT_ACTIONS[e.action as keyof typeof AUDIT_ACTIONS] ?? e.action,
      summary: e.summary,
      actor: e.actor ? fullName(e.actor) : null,
      actorRole: e.actorRole,
      metadata: e.metadata,
      createdAt: e.createdAt,
    })),
  });
});
