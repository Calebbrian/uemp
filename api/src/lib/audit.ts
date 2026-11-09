import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { Db } from '../db';
import type { AuthUser } from '../middleware/auth';

export const AUDIT_ACTIONS = {
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in',
  LOGOUT: 'Signed out',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET: 'Password reset',
  PROFILE_UPDATED: 'Profile updated',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
  USER_STATUS_CHANGED: 'Account status changed',
  USER_ROLE_CHANGED: 'Role changed',
  FACULTY_CREATED: 'Faculty created',
  FACULTY_UPDATED: 'Faculty updated',
  FACULTY_DELETED: 'Faculty deleted',
  DEPARTMENT_CREATED: 'Department created',
  DEPARTMENT_UPDATED: 'Department updated',
  DEPARTMENT_DELETED: 'Department deleted',
  PROGRAM_CREATED: 'Programme created',
  PROGRAM_UPDATED: 'Programme updated',
  PROGRAM_DELETED: 'Programme deleted',
  CURRICULUM_UPDATED: 'Curriculum updated',
  COURSE_CREATED: 'Course created',
  COURSE_UPDATED: 'Course updated',
  COURSE_DELETED: 'Course deleted',
  OFFERING_CREATED: 'Course offered',
  OFFERING_UPDATED: 'Offering updated',
  OFFERING_DELETED: 'Offering removed',
  LECTURERS_ASSIGNED: 'Lecturers assigned',
  SESSION_CREATED: 'Session created',
  SESSION_UPDATED: 'Session updated',
  SEMESTER_SET_CURRENT: 'Current semester changed',
  REGISTRATION_OPENED: 'Registration opened',
  REGISTRATION_CLOSED: 'Registration closed',
  COURSES_REGISTERED: 'Courses registered',
  COURSE_DROPPED: 'Course dropped',
  SCORES_SAVED: 'Scores updated',
  RESULT_SUBMITTED: 'Result submitted',
  RESULT_APPROVED: 'Result approved',
  RESULT_REJECTED: 'Result rejected',
  RESULT_REOPENED: 'Result reopened',
  GRADING_SCALE_UPDATED: 'Grading scale updated',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

type AuditEntry = {
  actor?: Pick<AuthUser, 'id' | 'role'> | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  departmentId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
};

/** Pass the transaction client so the log entry commits or rolls back with the change it records. */
export async function audit(db: Db, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      actorId: entry.actor?.id ?? null,
      actorRole: entry.actor?.role ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      departmentId: entry.departmentId ?? null,
      summary: entry.summary,
      metadata: entry.metadata,
      ipAddress: entry.ip ?? null,
    },
  });
}

export const clientIp = (req: Request) => req.ip ?? null;
