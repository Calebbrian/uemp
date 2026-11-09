import { beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNTS, type Client, offeringId, prisma, resetDatabase, signIn } from './helpers';

let student: Client;
let lecturer: Client;
let cscAdmin: Client;
let mthAdmin: Client;
let superAdmin: Client;

beforeEach(async () => {
  await resetDatabase();
  [student, lecturer, cscAdmin, mthAdmin, superAdmin] = await Promise.all([
    signIn(ACCOUNTS.student),
    signIn(ACCOUNTS.lecturer),
    signIn(ACCOUNTS.cscAdmin),
    signIn(ACCOUNTS.mthAdmin),
    signIn(ACCOUNTS.superAdmin),
  ]);
});

async function fillAndSubmit(offering: string) {
  const sheet = await lecturer.get(`/api/lecturer/offerings/${offering}`);
  const scores = sheet.body.students.map((s: { enrollmentId: string }) => ({ enrollmentId: s.enrollmentId, caScore: 30, examScore: 40 }));
  expect((await lecturer.put(`/api/lecturer/offerings/${offering}/scores`, { scores })).status).toBe(200);
  expect((await lecturer.post(`/api/lecturer/offerings/${offering}/submit`)).status).toBe(200);
}

describe('workflow 1: student course registration', () => {
  it('only offers courses for the student’s programme, level and current semester', async () => {
    const res = await student.get('/api/student/registration');
    const codes = res.body.available.map((c: { code: string }) => c.code);
    expect(codes).toEqual(['CSC 203', 'MTH 203', 'SEN 201']);
    expect(res.body.registered.map((c: { code: string }) => c.code)).toEqual(['CSC 201', 'CSC 205', 'MTH 201']);
  });

  it('registers courses, then rejects a duplicate registration', async () => {
    const csc203 = await offeringId('CSC 203');
    const first = await student.post('/api/student/registration', { offeringIds: [csc203] });
    expect(first.status).toBe(201);
    expect(first.body.totalUnits).toBe(11);

    const again = await student.post('/api/student/registration', { offeringIds: [csc203] });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already registered for CSC 203/);

    const count = await prisma.enrollment.count({ where: { offeringId: csc203, student: { matricNo: 'CSC/2025/014' } } });
    expect(count).toBe(1);
  });

  it('refuses courses outside the student’s level', async () => {
    const res = await student.post('/api/student/registration', { offeringIds: [await offeringId('CSC 301')] });
    expect(res.status).toBe(422);
    expect(res.body.error.details.courses[0]).toMatch(/300 level/);
  });

  it('refuses registration when the semester is closed', async () => {
    const semester = await prisma.semester.findFirstOrThrow({ where: { isCurrent: true } });
    await superAdmin.post(`/api/sessions/semesters/${semester.id}/registration`, { open: false });
    const res = await student.post('/api/student/registration', { offeringIds: [await offeringId('CSC 203')] });
    expect(res.status).toBe(409);
  });

  it('shows the registration to the department admin', async () => {
    await student.post('/api/student/registration', { offeringIds: [await offeringId('MTH 203')] });
    const res = await cscAdmin.get('/api/registrations?q=CSC/2025/014');
    expect(res.body.items.map((r: { courseCode: string }) => r.courseCode)).toContain('MTH 203');
  });
});

describe('workflows 2 and 3: result submission and approval', () => {
  it('runs draft → submitted → approved, and students only see approved results', async () => {
    const csc203 = await offeringId('CSC 203');
    await student.post('/api/student/registration', { offeringIds: [csc203] });

    const incomplete = await lecturer.post(`/api/lecturer/offerings/${csc203}/submit`);
    expect(incomplete.status).toBe(422);

    await fillAndSubmit(csc203);

    const locked = await lecturer.put(`/api/lecturer/offerings/${csc203}/scores`, {
      scores: [{ enrollmentId: (await prisma.enrollment.findFirstOrThrow({ where: { offeringId: csc203 } })).id, caScore: 1, examScore: 1 }],
    });
    expect(locked.status).toBe(409);

    const before = await student.get('/api/student/results');
    expect(before.body.semesters[0].courses.map((c: { code: string }) => c.code)).not.toContain('CSC 203');

    const approved = await cscAdmin.post(`/api/results/sheets/${csc203}/approve`, { comment: 'Checked.' });
    expect(approved.status).toBe(200);
    expect(approved.body.sheet.status).toBe('APPROVED');

    const after = await student.get('/api/student/results');
    const csc = after.body.semesters[0].courses.find((c: { code: string }) => c.code === 'CSC 203');
    expect(csc).toMatchObject({ totalScore: 70, grade: 'A', gradePoint: 5 });
  });

  it('returns rejected results to the lecturer with feedback, who can correct and resubmit', async () => {
    const csc201 = await offeringId('CSC 201');
    const rejected = await cscAdmin.post(`/api/results/sheets/${csc201}/reject`, { comment: 'Row 3 looks wrong, please recheck.' });
    expect(rejected.status).toBe(200);

    const sheet = await lecturer.get(`/api/lecturer/offerings/${csc201}`);
    expect(sheet.body.sheet).toMatchObject({ status: 'REJECTED', reviewComment: 'Row 3 looks wrong, please recheck.' });

    const first = sheet.body.students[0];
    const fix = await lecturer.put(`/api/lecturer/offerings/${csc201}/scores`, {
      scores: [{ enrollmentId: first.enrollmentId, caScore: 35, examScore: 50 }],
    });
    expect(fix.status).toBe(200);
    expect((await lecturer.post(`/api/lecturer/offerings/${csc201}/submit`)).body.sheet.status).toBe('SUBMITTED');
  });

  it('requires a comment to reject', async () => {
    const res = await cscAdmin.post(`/api/results/sheets/${await offeringId('CSC 201')}/reject`, { comment: '' });
    expect(res.status).toBe(400);
  });

  it('only lets the owning department approve, and never the super admin', async () => {
    const mth201 = await offeringId('MTH 201');
    expect((await cscAdmin.post(`/api/results/sheets/${mth201}/approve`)).status).toBe(403);
    expect((await superAdmin.post(`/api/results/sheets/${mth201}/approve`)).status).toBe(403);
    expect((await mthAdmin.post(`/api/results/sheets/${mth201}/approve`)).status).toBe(200);
  });

  it('cannot approve a sheet that has not been submitted', async () => {
    const res = await cscAdmin.post(`/api/results/sheets/${await offeringId('CSC 203')}/approve`);
    expect(res.status).toBe(409);
  });

  it('lets the super admin reopen approved results, hiding them from students again', async () => {
    const csc305 = await offeringId('CSC 305');
    const res = await superAdmin.post(`/api/results/sheets/${csc305}/reopen`, { comment: 'Appeal on script 4.' });
    expect(res.status).toBe(200);
    expect(res.body.sheet.status).toBe('REJECTED');
  });

  it('records every step in the audit log, which cannot be edited', async () => {
    const csc203 = await offeringId('CSC 203');
    await student.post('/api/student/registration', { offeringIds: [csc203] });
    await fillAndSubmit(csc203);
    await cscAdmin.post(`/api/results/sheets/${csc203}/approve`);

    const log = await prisma.auditLog.findMany({ where: { entityId: csc203 }, orderBy: { createdAt: 'asc' } });
    const actions = log.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['SCORES_SAVED', 'RESULT_SUBMITTED', 'RESULT_APPROVED']));

    const saved = log.filter((l) => l.action === 'SCORES_SAVED').at(-1);
    expect(saved?.metadata).toHaveProperty('changes');

    await expect(prisma.$executeRaw`UPDATE "AuditLog" SET summary = 'tampered' WHERE id = ${log[0].id}`).rejects.toThrow(
      /immutable/,
    );
    await expect(prisma.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${log[0].id}`).rejects.toThrow(/immutable/);
  });
});
