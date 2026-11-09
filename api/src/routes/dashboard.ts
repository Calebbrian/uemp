import { Router } from 'express';
import type { ResultStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { AUDIT_ACTIONS } from '../lib/audit';
import { formatSemester, fullName, getCurrentSemester } from '../lib/academic';
import { departmentFilter } from '../lib/scope';
import { id, optionalQuery, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';

export const dashboardRouter = Router();

const emptyCounts = (): Record<ResultStatus, number> => ({ DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0 });

async function recentActivity(departmentId?: string, take = 8) {
  const entries = await prisma.auditLog.findMany({
    where: { departmentId, action: { notIn: ['LOGIN', 'LOGOUT', 'LOGIN_FAILED'] } },
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return entries.map((e) => ({
    id: e.id,
    action: e.action,
    label: AUDIT_ACTIONS[e.action as keyof typeof AUDIT_ACTIONS] ?? e.action,
    summary: e.summary,
    actor: e.actor ? fullName(e.actor) : 'System',
    actorRole: e.actorRole,
    createdAt: e.createdAt,
  }));
}

/** Department admin dashboard. Super admins can view any department's version. */
dashboardRouter.get('/department', requirePermission('students.manage'), async (req, res) => {
  const user = currentUser(req);
  const q = parse(z.object({ departmentId: optionalQuery(id) }), req.query);
  const dept = departmentFilter(user, q.departmentId);
  const semester = await getCurrentSemester(prisma);

  const [department, students, lecturers, courses, offerings, levelGroups, activity] = await Promise.all([
    dept ? prisma.department.findUnique({ where: { id: dept }, include: { faculty: true } }) : null,
    prisma.user.count({ where: { role: 'STUDENT', departmentId: dept, status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'LECTURER', departmentId: dept, status: 'ACTIVE' } }),
    prisma.course.count({ where: { departmentId: dept, isActive: true } }),
    semester
      ? prisma.courseOffering.findMany({
          where: { semesterId: semester.id, course: { departmentId: dept } },
          include: {
            course: true,
            resultSheet: { include: { submittedBy: true } },
            allocations: { include: { lecturer: { include: { user: true } } } },
            _count: { select: { enrollments: true } },
          },
          orderBy: { course: { code: 'asc' } },
        })
      : [],
    prisma.student.groupBy({ by: ['level'], where: { user: { departmentId: dept, status: 'ACTIVE' } }, _count: { _all: true } }),
    recentActivity(dept),
  ]);

  const counts = emptyCounts();
  for (const o of offerings) counts[o.resultSheet?.status ?? 'DRAFT'] += 1;

  const registrations = semester
    ? await prisma.enrollment.count({
        where: {
          offering: { semesterId: semester.id },
          // Same scope as the Registrations page: own students plus anyone taking the department's courses.
          ...(dept ? { OR: [{ student: { user: { departmentId: dept } } }, { offering: { course: { departmentId: dept } } }] } : {}),
        },
      })
    : 0;

  res.json({
    department: department
      ? { id: department.id, code: department.code, name: department.name, faculty: department.faculty.name }
      : null,
    semester: formatSemester(semester),
    stats: { students, lecturers, courses, offerings: offerings.length, registrations, pendingApproval: counts.SUBMITTED },
    resultCounts: counts,
    pending: offerings
      .filter((o) => o.resultSheet?.status === 'SUBMITTED')
      .map((o) => ({
        offeringId: o.id,
        code: o.course.code,
        title: o.course.title,
        students: o._count.enrollments,
        lecturers: o.allocations.map((a) => fullName(a.lecturer.user)),
        submittedBy: o.resultSheet?.submittedBy ? fullName(o.resultSheet.submittedBy) : null,
        submittedAt: o.resultSheet?.submittedAt ?? null,
      })),
    studentsByLevel: levelGroups.sort((a, b) => a.level - b.level).map((g) => ({ level: g.level, count: g._count._all })),
    activity,
  });
});

/** University-wide dashboard for the super admin. */
dashboardRouter.get('/university', requirePermission('users.manage'), async (_req, res) => {
  const semester = await getCurrentSemester(prisma);
  const [faculties, departments, programs, students, lecturers, courses, activity] = await Promise.all([
    prisma.faculty.findMany({ include: { departments: true }, orderBy: { name: 'asc' } }),
    prisma.department.findMany({ orderBy: { name: 'asc' } }),
    prisma.program.count(),
    prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'LECTURER', status: 'ACTIVE' } }),
    prisma.course.count({ where: { isActive: true } }),
    recentActivity(undefined, 10),
  ]);

  const offerings = semester
    ? await prisma.courseOffering.findMany({
        where: { semesterId: semester.id },
        include: { course: true, resultSheet: true, enrollments: { select: { student: { select: { user: { select: { departmentId: true } } } } } } },
      })
    : [];

  const byDepartment = new Map(departments.map((d) => [d.id, { ...emptyCounts(), registrations: 0 }]));
  let registrations = 0;
  for (const o of offerings) {
    const row = byDepartment.get(o.course.departmentId);
    if (row) row[o.resultSheet?.status ?? 'DRAFT'] += 1;
    for (const e of o.enrollments) {
      registrations += 1;
      const studentDept = e.student.user.departmentId;
      const target = studentDept ? byDepartment.get(studentDept) : undefined;
      if (target) target.registrations += 1;
    }
  }

  res.json({
    semester: formatSemester(semester),
    stats: {
      faculties: faculties.length,
      departments: departments.length,
      programs,
      students,
      lecturers,
      courses,
      registrations,
    },
    resultsByDepartment: departments.map((d) => ({ id: d.id, code: d.code, name: d.name, ...byDepartment.get(d.id)! })),
    registrationsByFaculty: faculties.map((f) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      registrations: f.departments.reduce((sum, d) => sum + (byDepartment.get(d.id)?.registrations ?? 0), 0),
    })),
    activity,
  });
});
