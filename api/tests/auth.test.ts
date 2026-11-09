import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, app, prisma, request, resetDatabase, signIn } from './helpers';

beforeAll(resetDatabase);

const ajax = { 'X-Requested-With': 'XMLHttpRequest' };

describe('authentication', () => {
  it('signs in with valid credentials and returns the profile', async () => {
    const res = await request(app).post('/api/auth/login').set(ajax).send({ email: ACCOUNTS.student, password: 'Password@123' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'STUDENT', student: { matricNo: 'CSC/2025/014' } });
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(res.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrong = await request(app).post('/api/auth/login').set(ajax).send({ email: ACCOUNTS.student, password: 'nope' });
    const unknown = await request(app).post('/api/auth/login').set(ajax).send({ email: 'nobody@uemp.test', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses suspended accounts', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(ajax)
      .send({ email: 'oluwaseun.adebayo@uemp.test', password: 'Password@123' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('blocks state-changing requests without the AJAX header (CSRF)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ACCOUNTS.student, password: 'Password@123' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  it('invalidates the session on logout', async () => {
    const student = await signIn(ACCOUNTS.student);
    expect((await student.get('/api/auth/me')).status).toBe(200);
    await student.post('/api/auth/logout');
    expect((await student.get('/api/auth/me')).status).toBe(401);
  });

  it('signs a user out immediately when an admin suspends them', async () => {
    const lecturer = await signIn(ACCOUNTS.lecturer);
    const admin = await signIn(ACCOUNTS.superAdmin);
    const target = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.lecturer } });

    const res = await admin.post(`/api/users/${target.id}/status`, { status: 'SUSPENDED', reason: 'Test' });
    expect(res.status).toBe(200);
    expect((await lecturer.get('/api/lecturer/dashboard')).status).toBe(401);

    await admin.post(`/api/users/${target.id}/status`, { status: 'ACTIVE' });
  });

  it('stores only a hash of the session token', async () => {
    const res = await request(app).post('/api/auth/login').set(ajax).send({ email: ACCOUNTS.cscAdmin, password: 'Password@123' });
    const token = /uemp_session=([^;]+)/.exec(res.headers['set-cookie'][0])![1];
    expect(await prisma.authSession.findUnique({ where: { id: token } })).toBeNull();
  });
});
