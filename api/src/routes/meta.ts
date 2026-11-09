import { Router } from 'express';
import { prisma } from '../db';
import { PERMISSIONS } from '../auth/permissions';
import { formatSemester, getCurrentSemester, programLabel, semesterOrder } from '../lib/academic';
import { departmentFilter } from '../lib/scope';
import { getBands } from '../services/results';
import { currentUser, requireAuth, requirePermission } from '../middleware/auth';
import { rules } from '../config';

/** Reference data shared by every signed-in role. */
export const metaRouter = Router();
metaRouter.use(requireAuth);

metaRouter.get('/current-semester', async (_req, res) => {
  res.json({ semester: formatSemester(await getCurrentSemester(prisma)) });
});

metaRouter.get('/semesters', async (_req, res) => {
  const semesters = await prisma.semester.findMany({ include: { session: true } });
  semesters.sort((a, b) => semesterOrder(b) - semesterOrder(a));
  res.json({ items: semesters.map(formatSemester) });
});

metaRouter.get('/grading-scale', async (_req, res) => {
  res.json({ bands: await getBands(), limits: { caMax: rules.caMax, examMax: rules.examMax } });
});

metaRouter.get('/permissions', (_req, res) => {
  res.json({
    items: Object.entries(PERMISSIONS).map(([key, def]) => ({ key, ...def })),
  });
});

/** Dropdown options for admin forms, scoped to what the admin can manage. */
metaRouter.get(
  '/options',
  requirePermission('students.manage', 'courses.manage', 'faculties.manage'),
  async (req, res) => {
    const user = currentUser(req);
    const dept = departmentFilter(user);
    const [faculties, departments, programs] = await Promise.all([
      prisma.faculty.findMany({ orderBy: { name: 'asc' } }),
      prisma.department.findMany({ orderBy: { name: 'asc' } }),
      prisma.program.findMany({ where: { departmentId: dept }, orderBy: { name: 'asc' } }),
    ]);
    res.json({
      faculties: faculties.map((f) => ({ id: f.id, code: f.code, name: f.name })),
      departments: departments.map((d) => ({ id: d.id, code: d.code, name: d.name, facultyId: d.facultyId })),
      programs: programs.map((p) => ({
        id: p.id,
        code: p.code,
        name: programLabel(p),
        departmentId: p.departmentId,
        durationYears: p.durationYears,
      })),
    });
  },
);
