import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { formatSemester, fullName, getCurrentSemester, resolveSemester, semesterOrder } from '../lib/academic';
import { id, optionalText, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';
import { dropCourse, registerCourses, registrationOverview } from '../services/registration';
import { transcript } from '../services/transcript';
import { loadProfile } from './auth';

/** Self-service endpoints. Every query is keyed on the signed-in student's id. */
export const studentRouter = Router();
studentRouter.use(requirePermission('profile.self'));

studentRouter.get('/dashboard', async (req, res) => {
  const me = currentUser(req);
  const [profile, semester, t] = await Promise.all([
    loadProfile(me.id),
    getCurrentSemester(prisma),
    transcript(me.id),
  ]);
  const current = semester
    ? await prisma.enrollment.findMany({
        where: { studentId: me.id, offering: { semesterId: semester.id } },
        include: { offering: { include: { course: true } } },
      })
    : [];
  const latest = t.semesters.find((s) => s.courses.length > 0);

  res.json({
    profile,
    semester: formatSemester(semester),
    registration: { courses: current.length, units: current.reduce((sum, e) => sum + e.units, 0) },
    cgpa: t.cgpa,
    classOfDegree: t.classOfDegree,
    lastGpa: t.lastGpa,
    unitsPassed: t.unitsPassed,
    recentResults: latest
      ? { semester: latest.semester, gpa: latest.gpa, courses: latest.courses.slice(0, 6) }
      : null,
  });
});

studentRouter.get('/profile', async (req, res) => {
  res.json({ user: await loadProfile(currentUser(req).id) });
});

const profileSchema = z.object({
  phone: optionalText(30),
  address: optionalText(300),
  gender: z.enum(['Female', 'Male']).nullable().optional(),
  dateOfBirth: z.iso.date('Use a valid date').nullable().optional(),
});

/** Students may only change contact details; academic fields are owned by the department. */
studentRouter.patch('/profile', async (req, res) => {
  const me = currentUser(req);
  const body = parse(profileSchema, req.body);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: me.id }, data: { phone: body.phone } });
    await tx.student.update({
      where: { userId: me.id },
      data: {
        address: body.address,
        gender: body.gender ?? null,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      },
    });
    await audit(tx, {
      actor: me,
      action: 'PROFILE_UPDATED',
      entityType: 'Student',
      entityId: me.id,
      departmentId: me.departmentId,
      summary: `${me.email} updated their profile`,
      ip: clientIp(req),
    });
  });
  res.json({ user: await loadProfile(me.id) });
});

studentRouter.get('/registration', requirePermission('registration.self'), async (req, res) => {
  res.json(await registrationOverview(currentUser(req).id));
});

studentRouter.post('/registration', requirePermission('registration.self'), async (req, res) => {
  const body = parse(
    z.object({ offeringIds: z.array(id).min(1, 'Select at least one course').max(15) }),
    req.body,
  );
  const result = await registerCourses(currentUser(req), body.offeringIds, clientIp(req));
  res.status(201).json(result);
});

studentRouter.delete('/registration/:enrollmentId', requirePermission('registration.self'), async (req, res) => {
  res.json(await dropCourse(currentUser(req), String(req.params.enrollmentId), clientIp(req)));
});

studentRouter.get('/semesters', async (req, res) => {
  const me = currentUser(req);
  const semesters = await prisma.semester.findMany({
    where: { OR: [{ isCurrent: true }, { offerings: { some: { enrollments: { some: { studentId: me.id } } } } }] },
    include: { session: true },
  });
  semesters.sort((a, b) => semesterOrder(b) - semesterOrder(a));
  res.json({ items: semesters.map(formatSemester) });
});

studentRouter.get('/courses', async (req, res) => {
  const me = currentUser(req);
  const query = parse(z.object({ semesterId: id.optional() }), req.query);
  const semester = await resolveSemester(prisma, query.semesterId);
  if (!semester) {
    res.json({ semester: null, courses: [], totalUnits: 0 });
    return;
  }
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: me.id, offering: { semesterId: semester.id } },
    include: {
      offering: {
        include: {
          course: { include: { department: true } },
          resultSheet: true,
          allocations: { include: { lecturer: { include: { user: true } } } },
        },
      },
    },
    orderBy: { offering: { course: { code: 'asc' } } },
  });
  res.json({
    semester: formatSemester(semester),
    courses: enrollments.map((e) => ({
      enrollmentId: e.id,
      code: e.offering.course.code,
      title: e.offering.course.title,
      units: e.units,
      department: e.offering.course.department.code,
      lecturers: e.offering.allocations.map((a) => fullName(a.lecturer.user)),
      resultReleased: e.offering.resultSheet?.status === 'APPROVED',
      registeredAt: e.createdAt,
    })),
    totalUnits: enrollments.reduce((sum, e) => sum + e.units, 0),
  });
});

studentRouter.get('/results', requirePermission('results.self'), async (req, res) => {
  res.json(await transcript(currentUser(req).id));
});
