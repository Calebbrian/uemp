import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { config } from '../config';
import { can, type Permission } from '../auth/permissions';
import { destroySession, findSession } from '../auth/session';
import { forbidden, unauthorized } from '../lib/errors';

export type AuthUser = {
  id: string;
  sessionId: string;
  email: string;
  role: Role;
  departmentId: string | null;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Loads the signed-in user, if any. Suspended or inactive accounts are treated as signed out. */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token: string | undefined = req.cookies?.[config.sessionCookie];
  if (token) {
    const session = await findSession(token);
    if (session && session.user.status === 'ACTIVE') {
      const u = session.user;
      req.user = {
        id: u.id,
        sessionId: session.id,
        email: u.email,
        role: u.role,
        departmentId: u.departmentId,
        name: [u.title, u.firstName, u.lastName].filter(Boolean).join(' '),
      };
    } else {
      if (session) await destroySession(token);
      res.clearCookie(config.sessionCookie, { path: '/' });
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  next();
}

/** Passes if the user's role holds any of the listed permissions. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!permissions.some((p) => can(req.user!.role, p))) throw forbidden();
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
