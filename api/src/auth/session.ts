import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config';
import { prisma } from '../db';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      ipAddress: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  return { token, expiresAt };
}

export async function findSession(token: string) {
  const id = hashToken(token);
  const session = await prisma.authSession.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.authSession.deleteMany({ where: { id } });
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.authSession.update({ where: { id }, data: { lastSeenAt: new Date() } });
  }
  return session;
}

export async function destroySession(token: string) {
  await prisma.authSession.deleteMany({ where: { id: hashToken(token) } });
}

/** Signs a user out everywhere, optionally keeping the session making the request. */
export async function destroyUserSessions(userId: string, keepSessionId?: string) {
  await prisma.authSession.deleteMany({
    where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
  });
}

export function cookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax' as const,
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}
