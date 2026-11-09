import type { Role } from '@prisma/client';
import { prisma, type Db } from '../db';
import { destroyUserSessions } from '../auth/session';
import { audit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { hashPassword, temporaryPassword } from '../lib/passwords';
import { assertDepartmentAccess } from '../lib/scope';
import type { AuthUser } from '../middleware/auth';

type NewAccount = {
  role: Role;
  email: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  departmentId: string | null;
};

/**
 * Creates the login account with a random one-time password. The password is
 * returned once so the admin can hand it over; only its hash is stored.
 */
export async function createAccount(tx: Db, input: NewAccount) {
  const tempPassword = temporaryPassword();
  const user = await tx.user.create({
    data: {
      role: input.role,
      email: input.email,
      title: input.title ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      departmentId: input.departmentId,
      passwordHash: await hashPassword(tempPassword),
    },
  });
  return { user, tempPassword };
}

/** Department admins may only reset passwords for students and lecturers in their own department. */
export async function resetPassword(actor: AuthUser, userId: string, allowedRoles: Role[], ip: string | null) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || !allowedRoles.includes(target.role)) throw notFound('User');
  if (target.departmentId) assertDepartmentAccess(actor, target.departmentId);
  else if (actor.role !== 'SUPER_ADMIN') throw notFound('User');

  const tempPassword = temporaryPassword();
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(tempPassword) } });
  await destroyUserSessions(userId);
  await audit(prisma, {
    actor,
    action: 'PASSWORD_RESET',
    entityType: 'User',
    entityId: userId,
    departmentId: target.departmentId,
    summary: `Password reset for ${target.email}`,
    ip,
  });
  return { tempPassword };
}
