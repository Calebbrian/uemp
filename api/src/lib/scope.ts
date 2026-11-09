import type { AuthUser } from '../middleware/auth';
import { forbidden, unprocessable } from './errors';

/**
 * Department scoping for admin endpoints. Super admins see everything and may
 * filter by department; department admins are always pinned to their own,
 * whatever the request asks for.
 */
export function departmentFilter(user: AuthUser, requested?: string): string | undefined {
  if (user.role === 'SUPER_ADMIN') return requested || undefined;
  if (!user.departmentId) throw forbidden('Your account is not linked to a department.');
  return user.departmentId;
}

export function assertDepartmentAccess(user: AuthUser, departmentId: string) {
  if (user.role === 'SUPER_ADMIN') return;
  if (!user.departmentId || user.departmentId !== departmentId) {
    throw forbidden('This record belongs to another department.');
  }
}

/** Department a new record is created in. Super admins must choose one. */
export function targetDepartment(user: AuthUser, requested?: string | null): string {
  if (user.role === 'SUPER_ADMIN') {
    if (!requested) throw unprocessable('Choose a department.', { fields: { departmentId: 'Required' } });
    return requested;
  }
  if (!user.departmentId) throw forbidden('Your account is not linked to a department.');
  if (requested && requested !== user.departmentId) {
    throw forbidden('You can only create records in your own department.');
  }
  return user.departmentId;
}
