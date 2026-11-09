import type { Role } from '@prisma/client';

/**
 * The single source of truth for who can do what. Route handlers check a
 * permission here first, then apply the scope (own record, assigned courses or
 * own department) in the query itself.
 *
 * Permissions are fixed in code rather than editable at runtime: several of
 * them encode rules from the brief (for example "only department admins can
 * approve results") that a configuration change must not be able to break.
 */
export type Scope = 'OWN' | 'ASSIGNED' | 'DEPARTMENT' | 'UNIVERSITY';

type Definition = { label: string; group: string; grants: Partial<Record<Role, Scope>> };

export const PERMISSIONS = {
  'profile.self': {
    group: 'Student',
    label: 'View and update own profile',
    grants: { STUDENT: 'OWN' },
  },
  'registration.self': {
    group: 'Student',
    label: 'Register and drop own courses',
    grants: { STUDENT: 'OWN' },
  },
  'results.self': {
    group: 'Student',
    label: 'View own approved results and CGPA',
    grants: { STUDENT: 'OWN' },
  },
  'teaching.view': {
    group: 'Teaching',
    label: 'View assigned courses and class lists',
    grants: { LECTURER: 'ASSIGNED' },
  },
  'scores.enter': {
    group: 'Teaching',
    label: 'Enter, save and submit scores',
    grants: { LECTURER: 'ASSIGNED' },
  },
  'students.manage': {
    group: 'Records',
    label: 'Register and manage students',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'lecturers.manage': {
    group: 'Records',
    label: 'Create and manage lecturer profiles',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'courses.manage': {
    group: 'Academics',
    label: 'Create and manage courses',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'programs.manage': {
    group: 'Academics',
    label: 'Manage programmes, levels and curricula',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'offerings.manage': {
    group: 'Academics',
    label: 'Offer courses and assign lecturers',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'registrations.view': {
    group: 'Academics',
    label: 'View course registrations',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'results.view': {
    group: 'Results',
    label: 'View submitted result sheets',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'results.approve': {
    group: 'Results',
    label: 'Approve or reject submitted results',
    grants: { DEPT_ADMIN: 'DEPARTMENT' },
  },
  'results.reopen': {
    group: 'Results',
    label: 'Reopen approved results for correction',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'reports.view': {
    group: 'Oversight',
    label: 'View and export reports',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'audit.view': {
    group: 'Oversight',
    label: 'View the audit log',
    grants: { DEPT_ADMIN: 'DEPARTMENT', SUPER_ADMIN: 'UNIVERSITY' },
  },
  'faculties.manage': {
    group: 'Administration',
    label: 'Create and manage faculties and departments',
    grants: { SUPER_ADMIN: 'UNIVERSITY' },
  },
  'sessions.manage': {
    group: 'Administration',
    label: 'Manage academic sessions, semesters and registration',
    grants: { SUPER_ADMIN: 'UNIVERSITY' },
  },
  'users.manage': {
    group: 'Administration',
    label: 'Manage all accounts, roles and account status',
    grants: { SUPER_ADMIN: 'UNIVERSITY' },
  },
  'grading.manage': {
    group: 'Administration',
    label: 'Configure the grading scale',
    grants: { SUPER_ADMIN: 'UNIVERSITY' },
  },
} satisfies Record<string, Definition>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  const grants: Definition['grants'] = PERMISSIONS[permission].grants;
  return grants[role] !== undefined;
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
