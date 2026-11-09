import { Router } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db';
import { permissionsFor } from '../auth/permissions';
import { cookieOptions, createSession, destroySession, destroyUserSessions } from '../auth/session';
import { audit, clientIp } from '../lib/audit';
import { programLabel } from '../lib/academic';
import { HttpError, notFound } from '../lib/errors';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/passwords';
import { email, parse, password } from '../lib/validate';
import { currentUser, requireAuth } from '../middleware/auth';

export const authRouter = Router();

const tooManyAttempts: Partial<Options> = {
  windowMs: 15 * 60 * 1000,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in a few minutes.' },
    });
  },
};

// Failed sign-ins are limited per account and, more loosely, per network, so one
// person's typos on a shared connection do not lock everyone else out.
const loginLimiters = [
  rateLimit({
    ...tooManyAttempts,
    limit: 10,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.email ?? '').trim().toLowerCase()}`,
  }),
  rateLimit({ ...tooManyAttempts, limit: 100 }),
];

export async function loadProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      department: { include: { faculty: true } },
      student: { include: { program: true } },
      lecturer: true,
    },
  });
  if (!user) throw notFound('User');
  return {
    id: user.id,
    email: user.email,
    title: user.title,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    department: user.department
      ? {
          id: user.department.id,
          code: user.department.code,
          name: user.department.name,
          faculty: { id: user.department.faculty.id, code: user.department.faculty.code, name: user.department.faculty.name },
        }
      : null,
    student: user.student
      ? {
          matricNo: user.student.matricNo,
          level: user.student.level,
          entryYear: user.student.entryYear,
          gender: user.student.gender,
          dateOfBirth: user.student.dateOfBirth,
          address: user.student.address,
          program: {
            id: user.student.program.id,
            code: user.student.program.code,
            name: programLabel(user.student.program),
          },
        }
      : null,
    lecturer: user.lecturer ? { staffId: user.lecturer.staffId, rank: user.lecturer.rank } : null,
    permissions: permissionsFor(user.role),
  };
}

authRouter.post('/login', ...loginLimiters, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1, 'Enter your password').max(200) }), req.body);
  const ip = clientIp(req);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const valid = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    await audit(prisma, {
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user?.id,
      departmentId: user?.departmentId,
      summary: `Failed sign-in for ${body.email}`,
      ip,
    });
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  }
  if (user.status !== 'ACTIVE') {
    throw new HttpError(
      403,
      `ACCOUNT_${user.status}`,
      user.status === 'SUSPENDED'
        ? 'Your account has been suspended. Contact the registry.'
        : 'Your account is inactive. Contact the registry.',
    );
  }

  const { token, expiresAt } = await createSession(user.id, { ip: ip ?? undefined, userAgent: req.get('user-agent') });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(prisma, {
    actor: { id: user.id, role: user.role },
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    departmentId: user.departmentId,
    summary: `${user.email} signed in`,
    ip,
  });

  res.cookie(config.sessionCookie, token, cookieOptions(expiresAt));
  res.json({ user: await loadProfile(user.id) });
});

authRouter.post('/logout', async (req, res) => {
  const token: string | undefined = req.cookies?.[config.sessionCookie];
  if (token) await destroySession(token);
  if (req.user) {
    await audit(prisma, {
      actor: req.user,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: req.user.id,
      departmentId: req.user.departmentId,
      summary: `${req.user.email} signed out`,
      ip: clientIp(req),
    });
  }
  res.clearCookie(config.sessionCookie, cookieOptions());
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await loadProfile(currentUser(req).id) });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const me = currentUser(req);
  const body = parse(
    z
      .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: password })
      .refine((b) => b.currentPassword !== b.newPassword, {
        path: ['newPassword'],
        message: 'Choose a password you have not just used',
      }),
    req.body,
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Some fields need attention.', {
      fields: { currentPassword: 'Current password is incorrect' },
    });
  }
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
  await destroyUserSessions(me.id, me.sessionId);
  await audit(prisma, {
    actor: me,
    action: 'PASSWORD_CHANGED',
    entityType: 'User',
    entityId: me.id,
    departmentId: me.departmentId,
    summary: `${me.email} changed their password`,
    ip: clientIp(req),
  });
  res.json({ ok: true });
});
