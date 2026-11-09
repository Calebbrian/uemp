import type { Prisma, ResultSheet, ResultStatus } from '@prisma/client';
import { rules } from '../config';
import { prisma, type Db } from '../db';
import { AUDIT_ACTIONS, audit } from '../lib/audit';
import { formatSemester, fullName } from '../lib/academic';
import { conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import { computeResult, summarize, type Band } from '../lib/grading';
import { assertDepartmentAccess } from '../lib/scope';
import type { AuthUser } from '../middleware/auth';

/**
 * Result sheet lifecycle (one sheet per course offering):
 *
 *   DRAFT --submit--> SUBMITTED --approve--> APPROVED
 *     ^                  |                     |
 *     |               reject                 reopen
 *     |                  v                     |
 *     +-- (edit) --- REJECTED <----------------+
 *
 * Lecturers can only edit scores while the sheet is DRAFT or REJECTED.
 * Students only ever see scores from APPROVED sheets.
 */
const EDITABLE: ResultStatus[] = ['DRAFT', 'REJECTED'];

export const getBands = (db: Db = prisma): Promise<Band[]> =>
  db.gradeBand.findMany({ orderBy: { minScore: 'desc' } });

/**
 * Locks the sheet row for the rest of the transaction so a lecturer saving
 * scores and an admin approving the same sheet cannot interleave.
 */
async function lockSheet(tx: Prisma.TransactionClient, offeringId: string): Promise<ResultSheet> {
  await tx.resultSheet.upsert({ where: { offeringId }, create: { offeringId }, update: {} });
  const rows = await tx.$queryRaw<ResultSheet[]>`
    SELECT * FROM "ResultSheet" WHERE "offeringId" = ${offeringId} FOR UPDATE`;
  return rows[0];
}

async function loadOffering(db: Db, offeringId: string) {
  const offering = await db.courseOffering.findUnique({
    where: { id: offeringId },
    include: {
      course: { include: { department: true } },
      semester: { include: { session: true } },
      allocations: { include: { lecturer: { include: { user: true } } } },
    },
  });
  if (!offering) throw notFound('Course offering');
  return offering;
}

function assertAllocated(user: AuthUser, offering: { allocations: { lecturerId: string }[] }) {
  if (!offering.allocations.some((a) => a.lecturerId === user.id)) {
    throw forbidden('You are not assigned to this course.');
  }
}

/** Lecturers must be allocated; admins must be in the course's department (super admins anywhere). */
export async function assertCanViewSheet(user: AuthUser, offeringId: string) {
  const offering = await loadOffering(prisma, offeringId);
  if (user.role === 'LECTURER') assertAllocated(user, offering);
  else if (user.role === 'DEPT_ADMIN' || user.role === 'SUPER_ADMIN')
    assertDepartmentAccess(user, offering.course.departmentId);
  else throw forbidden();
  return offering;
}

export async function sheetDetail(offeringId: string) {
  const offering = await loadOffering(prisma, offeringId);
  const [sheet, enrollments, bands, history] = await Promise.all([
    prisma.resultSheet.findUnique({
      where: { offeringId },
      include: { submittedBy: true, reviewedBy: true },
    }),
    prisma.enrollment.findMany({
      where: { offeringId },
      include: { student: { include: { user: true } }, result: true },
      orderBy: { student: { matricNo: 'asc' } },
    }),
    getBands(),
    prisma.auditLog.findMany({
      where: { entityType: 'ResultSheet', entityId: offeringId },
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const students = enrollments.map((e) => ({
    enrollmentId: e.id,
    matricNo: e.student.matricNo,
    name: fullName(e.student.user),
    level: e.student.level,
    caScore: e.result?.caScore ?? null,
    examScore: e.result?.examScore ?? null,
    totalScore: e.result?.totalScore ?? null,
    grade: e.result?.grade ?? null,
    gradePoint: e.result?.gradePoint ?? null,
  }));

  return {
    offering: {
      id: offering.id,
      capacity: offering.capacity,
      course: {
        id: offering.course.id,
        code: offering.course.code,
        title: offering.course.title,
        units: offering.course.units,
        level: offering.course.level,
        department: { id: offering.course.department.id, code: offering.course.department.code, name: offering.course.department.name },
      },
      semester: formatSemester(offering.semester),
      lecturers: offering.allocations.map((a) => ({ id: a.lecturerId, name: fullName(a.lecturer.user) })),
    },
    sheet: {
      status: sheet?.status ?? 'DRAFT',
      submittedAt: sheet?.submittedAt ?? null,
      submittedBy: sheet?.submittedBy ? fullName(sheet.submittedBy) : null,
      submittedById: sheet?.submittedById ?? null,
      reviewedAt: sheet?.reviewedAt ?? null,
      reviewedBy: sheet?.reviewedBy ? fullName(sheet.reviewedBy) : null,
      reviewComment: sheet?.reviewComment ?? null,
      updatedAt: sheet?.updatedAt ?? null,
    },
    students,
    summary: summarize(students, bands),
    gradeBands: bands,
    limits: { caMax: rules.caMax, examMax: rules.examMax },
    history: history.map((h) => ({
      id: h.id,
      action: h.action,
      label: AUDIT_ACTIONS[h.action as keyof typeof AUDIT_ACTIONS] ?? h.action,
      actor: h.actor ? fullName(h.actor) : null,
      actorRole: h.actorRole,
      summary: h.summary,
      metadata: h.metadata,
      createdAt: h.createdAt,
    })),
  };
}

type ScoreInput = { enrollmentId: string; caScore: number | null; examScore: number | null };

export async function saveScores(user: AuthUser, offeringId: string, scores: ScoreInput[], ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const offering = await loadOffering(tx, offeringId);
    assertAllocated(user, offering);

    const sheet = await lockSheet(tx, offeringId);
    if (!EDITABLE.includes(sheet.status)) {
      throw conflict(
        sheet.status === 'SUBMITTED'
          ? 'These results have been submitted and are locked until the department reviews them.'
          : 'These results have been approved. Ask your department admin to reopen them before making changes.',
      );
    }

    const enrollments = await tx.enrollment.findMany({
      where: { offeringId },
      include: { result: true, student: true },
    });
    const byId = new Map(enrollments.map((e) => [e.id, e]));
    const bands = await getBands(tx);

    const changes: { matricNo: string; before: { ca: number | null; exam: number | null }; after: { ca: number | null; exam: number | null } }[] = [];
    for (const s of scores) {
      const enrollment = byId.get(s.enrollmentId);
      if (!enrollment) throw unprocessable('One of the students is not registered for this course.');

      const before = { ca: enrollment.result?.caScore ?? null, exam: enrollment.result?.examScore ?? null };
      const after = { ca: s.caScore, exam: s.examScore };
      if (before.ca === after.ca && before.exam === after.exam) continue;

      const computed = computeResult(after.ca, after.exam, bands);
      const data = { caScore: after.ca, examScore: after.exam, ...computed, updatedById: user.id };
      await tx.result.upsert({
        where: { enrollmentId: enrollment.id },
        create: { enrollmentId: enrollment.id, ...data },
        update: data,
      });
      changes.push({ matricNo: enrollment.student.matricNo, before, after });
    }

    if (changes.length) {
      await tx.resultSheet.update({ where: { offeringId }, data: { updatedAt: new Date() } });
      await audit(tx, {
        actor: user,
        action: 'SCORES_SAVED',
        entityType: 'ResultSheet',
        entityId: offeringId,
        departmentId: offering.course.departmentId,
        summary: `Updated ${changes.length} score${changes.length === 1 ? '' : 's'} for ${offering.course.code}`,
        metadata: { changes },
        ip,
      });
    }
    return { updated: changes.length };
  });
}

export async function submitSheet(user: AuthUser, offeringId: string, ip: string | null) {
  return prisma.$transaction(async (tx) => {
    const offering = await loadOffering(tx, offeringId);
    assertAllocated(user, offering);

    const sheet = await lockSheet(tx, offeringId);
    if (sheet.status === 'SUBMITTED') throw conflict('These results have already been submitted.');
    if (sheet.status === 'APPROVED') throw conflict('These results have already been approved.');

    const enrollments = await tx.enrollment.findMany({
      where: { offeringId },
      include: { result: true, student: true },
    });
    if (enrollments.length === 0) throw unprocessable('No students are registered for this course.');

    const missing = enrollments
      .filter((e) => e.result?.caScore == null || e.result?.examScore == null)
      .map((e) => e.student.matricNo);
    if (missing.length) {
      throw unprocessable(`Enter both CA and exam scores for every student before submitting (${missing.length} missing).`, {
        missing,
      });
    }

    await tx.resultSheet.update({
      where: { offeringId },
      data: {
        status: 'SUBMITTED',
        submittedById: user.id,
        submittedAt: new Date(),
        reviewedById: null,
        reviewedAt: null,
        reviewComment: null,
      },
    });
    await audit(tx, {
      actor: user,
      action: 'RESULT_SUBMITTED',
      entityType: 'ResultSheet',
      entityId: offeringId,
      departmentId: offering.course.departmentId,
      summary: `${offering.course.code} results submitted for approval (${enrollments.length} students)`,
      metadata: { previousStatus: sheet.status, students: enrollments.length },
      ip,
    });
    return { status: 'SUBMITTED' as const };
  });
}

type ReviewAction = 'approve' | 'reject' | 'reopen';

const REVIEW = {
  approve: { from: 'SUBMITTED', to: 'APPROVED', audit: 'RESULT_APPROVED', verb: 'approved' },
  reject: { from: 'SUBMITTED', to: 'REJECTED', audit: 'RESULT_REJECTED', verb: 'rejected' },
  reopen: { from: 'APPROVED', to: 'REJECTED', audit: 'RESULT_REOPENED', verb: 'reopened' },
} as const;

/**
 * Approve / reject: department admin of the course's department only.
 * Reopen: that department admin or a super admin.
 * Nobody can review a sheet they submitted themselves.
 */
export async function reviewSheet(
  user: AuthUser,
  offeringId: string,
  action: ReviewAction,
  comment: string | null,
  ip: string | null,
) {
  const step = REVIEW[action];
  return prisma.$transaction(async (tx) => {
    const offering = await loadOffering(tx, offeringId);
    assertDepartmentAccess(user, offering.course.departmentId);
    if (action !== 'reopen' && user.role !== 'DEPT_ADMIN') {
      throw forbidden('Only the department admin can approve or reject results.');
    }

    const sheet = await lockSheet(tx, offeringId);
    if (sheet.status !== step.from) {
      const messages: Record<ResultStatus, string> = {
        DRAFT: 'These results have not been submitted by the lecturer yet.',
        SUBMITTED: 'These results are waiting for review, not approved.',
        APPROVED: 'These results have already been approved.',
        REJECTED: 'These results were returned to the lecturer and have not been resubmitted.',
      };
      throw conflict(messages[sheet.status]);
    }
    if (sheet.submittedById === user.id) throw forbidden('You cannot review results you submitted yourself.');

    await tx.resultSheet.update({
      where: { offeringId },
      data: { status: step.to, reviewedById: user.id, reviewedAt: new Date(), reviewComment: comment },
    });
    await audit(tx, {
      actor: user,
      action: step.audit,
      entityType: 'ResultSheet',
      entityId: offeringId,
      departmentId: offering.course.departmentId,
      summary: `${offering.course.code} results ${step.verb}${comment ? `: “${comment}”` : ''}`,
      metadata: { previousStatus: sheet.status, comment },
      ip,
    });
    return { status: step.to };
  });
}
