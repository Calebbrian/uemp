import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, app, type Client, offeringId, prisma, request, resetDatabase, signIn } from './helpers';

let student: Client;
let lecturer: Client;
let cscAdmin: Client;
let superAdmin: Client;

beforeAll(async () => {
  await resetDatabase();
  [student, lecturer, cscAdmin, superAdmin] = await Promise.all([
    signIn(ACCOUNTS.student),
    signIn(ACCOUNTS.lecturer),
    signIn(ACCOUNTS.cscAdmin),
    signIn(ACCOUNTS.superAdmin),
  ]);
});

describe('role-based access to endpoints', () => {
  const matrix: [string, { student: number; lecturer: number; cscAdmin: number; superAdmin: number }][] = [
    ['/api/student/dashboard', { student: 200, lecturer: 403, cscAdmin: 403, superAdmin: 403 }],
    ['/api/lecturer/offerings', { student: 403, lecturer: 200, cscAdmin: 403, superAdmin: 403 }],
    ['/api/students', { student: 403, lecturer: 403, cscAdmin: 200, superAdmin: 200 }],
    ['/api/results/sheets', { student: 403, lecturer: 403, cscAdmin: 200, superAdmin: 200 }],
    ['/api/dashboard/department', { student: 403, lecturer: 403, cscAdmin: 200, superAdmin: 200 }],
    ['/api/dashboard/university', { student: 403, lecturer: 403, cscAdmin: 403, superAdmin: 200 }],
    ['/api/users', { student: 403, lecturer: 403, cscAdmin: 403, superAdmin: 200 }],
    ['/api/audit-logs', { student: 403, lecturer: 403, cscAdmin: 200, superAdmin: 200 }],
  ];

  it.each(matrix)('%s', async (url, expected) => {
    const clients = { student, lecturer, cscAdmin, superAdmin };
    for (const [role, status] of Object.entries(expected)) {
      const res = await clients[role as keyof typeof clients].get(url);
      expect(res.status, `${role} -> ${url}`).toBe(status);
    }
  });

  it('rejects anonymous requests with 401', async () => {
    for (const url of ['/api/student/dashboard', '/api/students', '/api/users', '/api/meta/current-semester']) {
      expect((await request(app).get(url)).status).toBe(401);
    }
  });

  it('lets the super admin delete a department that has never been used', async () => {
    const faculty = await prisma.faculty.findUniqueOrThrow({ where: { code: 'SCI' } });
    const created = await superAdmin.post('/api/departments', { name: 'Physics', code: 'PHY', facultyId: faculty.id });
    expect(created.status).toBe(201);
    expect((await superAdmin.delete(`/api/departments/${created.body.department.id}`)).status).toBe(200);
  });

  it('only lets the super admin manage faculties', async () => {
    const body = { name: 'Faculty of Arts', code: 'ART' };
    expect((await cscAdmin.post('/api/faculties', body)).status).toBe(403);
    expect((await superAdmin.post('/api/faculties', body)).status).toBe(201);
  });
});

describe('department scoping', () => {
  it('pins department admins to their own department, whatever they ask for', async () => {
    const mth = await prisma.department.findUniqueOrThrow({ where: { code: 'MTH' } });
    const res = await cscAdmin.get(`/api/students?departmentId=${mth.id}&pageSize=200`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((s: { department: { code: string } }) => s.department.code === 'CSC')).toBe(true);
  });

  it("blocks editing another department's course", async () => {
    const mth201 = await prisma.course.findUniqueOrThrow({ where: { code: 'MTH 201' } });
    const res = await cscAdmin.patch(`/api/courses/${mth201.id}`, { title: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  it('blocks creating a student in another department', async () => {
    const mthProgram = await prisma.program.findUniqueOrThrow({ where: { code: 'BSC-MTH' } });
    const res = await cscAdmin.post('/api/students', {
      firstName: 'Test',
      lastName: 'Student',
      email: 'scope.test@uemp.test',
      matricNo: 'MTH/2026/099',
      programId: mthProgram.id,
      level: 100,
      entryYear: 2026,
    });
    expect(res.status).toBe(403);
  });

  it('does not let a department admin assign a lecturer from another department', async () => {
    const mthLecturer = await prisma.user.findFirstOrThrow({ where: { role: 'LECTURER', department: { code: 'MTH' } } });
    const res = await cscAdmin.put(`/api/offerings/${await offeringId('CSC 203')}/lecturers`, { lecturerIds: [mthLecturer.id] });
    expect(res.status).toBe(422);
  });
});

describe('students and lecturers', () => {
  it('lets a student see only their own data (ids are taken from the session)', async () => {
    const other = await prisma.student.findUniqueOrThrow({ where: { matricNo: 'CSC/2025/011' } });
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { studentId: other.userId } });
    const res = await student.delete(`/api/student/registration/${enrollment.id}`);
    expect(res.status).toBe(404);
  });

  it('stops a lecturer opening a score sheet for a course they do not teach', async () => {
    const res = await lecturer.get(`/api/lecturer/offerings/${await offeringId('MTH 201')}`);
    expect(res.status).toBe(403);
  });
});
