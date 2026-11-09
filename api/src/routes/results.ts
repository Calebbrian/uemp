import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { clientIp } from '../lib/audit';
import { formatSemester, fullName, resolveSemester } from '../lib/academic';
import { can } from '../auth/permissions';
import { departmentFilter } from '../lib/scope';
import { id, optionalQuery, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';
import { assertCanViewSheet, reviewSheet, sheetDetail } from '../services/results';

/** Department review of submitted result sheets. Keyed by course offering id. */
export const resultsRouter = Router();
resultsRouter.use(requirePermission('results.view'));

const statuses = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']);

resultsRouter.get('/sheets', async (req, res) => {
  const user = currentUser(req);
  const q = parse(
    z.object({
      semesterId: optionalQuery(id),
      status: optionalQuery(statuses),
      departmentId: optionalQuery(id),
      q: optionalQuery(z.string().trim().max(100)),
    }),
    req.query,
  );
  const semester = await resolveSemester(prisma, q.semesterId);
  if (!semester) {
    res.json({ semester: null, items: [], counts: {} });
    return;
  }
  const where: Prisma.CourseOfferingWhereInput = {
    semesterId: semester.id,
    course: {
      departmentId: departmentFilter(user, q.departmentId),
      ...(q.q
        ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
    },
  };
  const offerings = await prisma.courseOffering.findMany({
    where,
    include: {
      course: { include: { department: true } },
      allocations: { include: { lecturer: { include: { user: true } } } },
      resultSheet: { include: { submittedBy: true, reviewedBy: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { course: { code: 'asc' } },
  });

  const rows = offerings.map((o) => ({
    offeringId: o.id,
    code: o.course.code,
    title: o.course.title,
    units: o.course.units,
    department: { id: o.course.department.id, code: o.course.department.code, name: o.course.department.name },
    lecturers: o.allocations.map((a) => fullName(a.lecturer.user)),
    students: o._count.enrollments,
    status: o.resultSheet?.status ?? 'DRAFT',
    submittedBy: o.resultSheet?.submittedBy ? fullName(o.resultSheet.submittedBy) : null,
    submittedAt: o.resultSheet?.submittedAt ?? null,
    reviewedBy: o.resultSheet?.reviewedBy ? fullName(o.resultSheet.reviewedBy) : null,
    reviewedAt: o.resultSheet?.reviewedAt ?? null,
    reviewComment: o.resultSheet?.reviewComment ?? null,
  }));
  const counts = { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0 };
  for (const r of rows) counts[r.status] += 1;

  res.json({
    semester: formatSemester(semester),
    items: q.status ? rows.filter((r) => r.status === q.status) : rows,
    counts,
  });
});

resultsRouter.get('/sheets/:offeringId', async (req, res) => {
  const user = currentUser(req);
  const offeringId = String(req.params.offeringId);
  await assertCanViewSheet(user, offeringId);
  const detail = await sheetDetail(offeringId);
  const status = detail.sheet.status;
  const notSubmitter = detail.sheet.submittedById !== user.id;
  res.json({
    ...detail,
    actions: {
      canApprove: can(user.role, 'results.approve') && status === 'SUBMITTED' && notSubmitter,
      canReject: can(user.role, 'results.approve') && status === 'SUBMITTED' && notSubmitter,
      canReopen: can(user.role, 'results.reopen') && status === 'APPROVED',
    },
  });
});

const comment = (required: boolean) =>
  required
    ? z.string().trim().min(5, 'Explain what needs to change (at least 5 characters)').max(1000)
    : z
        .string()
        .trim()
        .max(1000)
        .optional()
        .nullable()
        .transform((v) => v || null);

resultsRouter.post('/sheets/:offeringId/approve', requirePermission('results.approve'), async (req, res) => {
  const body = parse(z.object({ comment: comment(false) }), req.body ?? {});
  const offeringId = String(req.params.offeringId);
  await reviewSheet(currentUser(req), offeringId, 'approve', body.comment, clientIp(req));
  res.json(await sheetDetail(offeringId));
});

resultsRouter.post('/sheets/:offeringId/reject', requirePermission('results.approve'), async (req, res) => {
  const body = parse(z.object({ comment: comment(true) }), req.body);
  const offeringId = String(req.params.offeringId);
  await reviewSheet(currentUser(req), offeringId, 'reject', body.comment, clientIp(req));
  res.json(await sheetDetail(offeringId));
});

resultsRouter.post('/sheets/:offeringId/reopen', requirePermission('results.reopen'), async (req, res) => {
  const body = parse(z.object({ comment: comment(true) }), req.body);
  const offeringId = String(req.params.offeringId);
  await reviewSheet(currentUser(req), offeringId, 'reopen', body.comment, clientIp(req));
  res.json(await sheetDetail(offeringId));
});
