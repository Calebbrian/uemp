import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { destroyUserSessions } from '../auth/session';
import { audit, clientIp } from '../lib/audit';
import { fullName, programLabel } from '../lib/academic';
import { forbidden, notFound, unprocessable } from '../lib/errors';
import {
  email,
  id,
  level,
  matricNo,
  optionalQuery,
  optionalText,
  pageArgs,
  pagination,
  parse,
  personName,
} from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';
import { createAccount, resetPassword } from '../services/accounts';

/** University-wide account management. Super admin only. */
export const usersRouter = Router();
usersRouter.use(requirePermission('users.manage'));

const include = {
  department: true,
  student: { include: { program: true } },
  lecturer: true,
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof include }>;

function formatUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    title: u.title,
    firstName: u.firstName,
    lastName: u.lastName,
    name: fullName(u),
    phone: u.phone,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    department: u.department ? { id: u.department.id, code: u.department.code, name: u.department.name } : null,
    matricNo: u.student?.matricNo ?? null,
    program: u.student ? programLabel(u.student.program) : null,
    level: u.student?.level ?? null,
    staffId: u.lecturer?.staffId ?? null,
    rank: u.lecturer?.rank ?? null,
  };
}

const roles = z.enum(['STUDENT', 'LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN']);
const statuses = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);

const listQuery = pagination.extend({
  q: optionalQuery(z.string().trim().max(100)),
  role: optionalQuery(roles),
  status: optionalQuery(statuses),
  departmentId: optionalQuery(id),
});

usersRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const where: Prisma.UserWhereInput = {
    role: q.role,
    status: q.status,
    departmentId: q.departmentId,
    ...(q.q
      ? {
          OR: [
            { firstName: { contains: q.q, mode: 'insensitive' } },
            { lastName: { contains: q.q, mode: 'insensitive' } },
            { email: { contains: q.q, mode: 'insensitive' } },
            { student: { matricNo: { contains: q.q, mode: 'insensitive' } } },
            { lecturer: { staffId: { contains: q.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total, counts] = await Promise.all([
    prisma.user.findMany({ where, include, orderBy: [{ role: 'desc' }, { lastName: 'asc' }], ...pageArgs(q) }),
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
  ]);
  res.json({
    items: items.map(formatUser),
    total,
    page: q.page,
    pageSize: q.pageSize,
    roleCounts: Object.fromEntries(counts.map((c) => [c.role, c._count._all])),
  });
});

usersRouter.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: String(req.params.id) }, include });
  if (!user) throw notFound('User');
  res.json({ user: formatUser(user) });
});

const base = {
  title: optionalText(20),
  firstName: personName,
  lastName: personName,
  email,
  phone: optionalText(30),
};

const createSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('STUDENT'),
    ...base,
    matricNo,
    programId: id,
    level,
    entryYear: z.coerce.number().int().min(1990).max(2100),
  }),
  z.object({
    role: z.literal('LECTURER'),
    ...base,
    departmentId: id,
    staffId: z.string().trim().min(1, 'Required').toUpperCase().regex(/^[A-Z0-9/-]{3,20}$/, 'Use letters, numbers and / only'),
    rank: optionalText(60),
  }),
  z.object({ role: z.literal('DEPT_ADMIN'), ...base, departmentId: id }),
  z.object({ role: z.literal('SUPER_ADMIN'), ...base }),
]);

usersRouter.post('/', async (req, res) => {
  const actor = currentUser(req);
  const body = parse(createSchema, req.body);

  let departmentId: string | null = null;
  if (body.role === 'STUDENT') {
    const program = await prisma.program.findUnique({ where: { id: body.programId } });
    if (!program) throw unprocessable('Choose a valid programme.', { fields: { programId: 'Choose a valid programme' } });
    departmentId = program.departmentId;
  } else if (body.role === 'LECTURER' || body.role === 'DEPT_ADMIN') {
    departmentId = body.departmentId;
  }

  const created = await prisma.$transaction(async (tx) => {
    const { user, tempPassword } = await createAccount(tx, { ...body, departmentId });
    if (body.role === 'STUDENT') {
      await tx.student.create({
        data: { userId: user.id, matricNo: body.matricNo, programId: body.programId, level: body.level, entryYear: body.entryYear },
      });
    }
    if (body.role === 'LECTURER') {
      await tx.lecturer.create({ data: { userId: user.id, staffId: body.staffId, rank: body.rank } });
    }
    await audit(tx, {
      actor,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      departmentId,
      summary: `${body.role.replace('_', ' ').toLowerCase()} account created for ${body.email}`,
      metadata: { role: body.role },
      ip: clientIp(req),
    });
    return { id: user.id, tempPassword };
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, include });
  res.status(201).json({ user: formatUser(user), tempPassword: created.tempPassword });
});

usersRouter.patch('/:id', async (req, res) => {
  const actor = currentUser(req);
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target) throw notFound('User');
  const body = parse(z.object({ ...base, departmentId: id.nullable() }).partial(), req.body);

  if (body.departmentId !== undefined) {
    if (target.role === 'STUDENT') {
      throw unprocessable("A student's department follows their programme. Change the programme instead.");
    }
    if (target.role === 'SUPER_ADMIN' && body.departmentId) {
      throw unprocessable('Super admins are not tied to a department.');
    }
    if ((target.role === 'LECTURER' || target.role === 'DEPT_ADMIN') && !body.departmentId) {
      throw unprocessable('Choose a department.', { fields: { departmentId: 'Required' } });
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: target.id }, data: body, include });
    await audit(tx, {
      actor,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: target.id,
      departmentId: updated.departmentId,
      summary: `${target.email} updated`,
      metadata: { changes: body, previousDepartmentId: target.departmentId },
      ip: clientIp(req),
    });
    return updated;
  });
  res.json({ user: formatUser(user) });
});

usersRouter.post('/:id/status', async (req, res) => {
  const actor = currentUser(req);
  const body = parse(z.object({ status: statuses, reason: optionalText(300) }), req.body);
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target) throw notFound('User');
  if (target.id === actor.id) throw forbidden('You cannot change the status of your own account.');

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: target.id }, data: { status: body.status }, include });
    await audit(tx, {
      actor,
      action: 'USER_STATUS_CHANGED',
      entityType: 'User',
      entityId: target.id,
      departmentId: target.departmentId,
      summary: `${target.email}: ${target.status.toLowerCase()} → ${body.status.toLowerCase()}`,
      metadata: { from: target.status, to: body.status, reason: body.reason },
      ip: clientIp(req),
    });
    return updated;
  });
  // A suspended or deactivated user is signed out everywhere straight away.
  if (body.status !== 'ACTIVE') await destroyUserSessions(target.id);
  res.json({ user: formatUser(user) });
});

/**
 * Staff can move between lecturer, department admin and super admin. Students
 * cannot become staff (or the reverse) because their records are different
 * shapes; create a separate account instead.
 */
usersRouter.post('/:id/role', async (req, res) => {
  const actor = currentUser(req);
  const body = parse(
    z.object({ role: z.enum(['LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN']), departmentId: id.optional(), staffId: z.string().trim().min(1, 'Required').toUpperCase().optional() }),
    req.body,
  );
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) }, include: { lecturer: true } });
  if (!target) throw notFound('User');
  if (target.id === actor.id) throw forbidden('You cannot change your own role.');
  if (target.role === 'STUDENT') {
    throw unprocessable('Student accounts cannot be moved to a staff role. Create a staff account instead.');
  }

  const departmentId = body.role === 'SUPER_ADMIN' ? null : (body.departmentId ?? target.departmentId);
  if (body.role !== 'SUPER_ADMIN' && !departmentId) {
    throw unprocessable('Choose a department for this role.', { fields: { departmentId: 'Required' } });
  }
  if (body.role === 'LECTURER' && !target.lecturer && !body.staffId) {
    throw unprocessable('Enter a staff ID for the new lecturer profile.', { fields: { staffId: 'Required' } });
  }

  const user = await prisma.$transaction(async (tx) => {
    if (body.role === 'LECTURER' && !target.lecturer) {
      await tx.lecturer.create({ data: { userId: target.id, staffId: body.staffId! } });
    }
    const updated = await tx.user.update({ where: { id: target.id }, data: { role: body.role, departmentId }, include });
    await audit(tx, {
      actor,
      action: 'USER_ROLE_CHANGED',
      entityType: 'User',
      entityId: target.id,
      departmentId,
      summary: `${target.email}: ${target.role} → ${body.role}`,
      metadata: { from: target.role, to: body.role, departmentId },
      ip: clientIp(req),
    });
    return updated;
  });
  await destroyUserSessions(target.id);
  res.json({ user: formatUser(user) });
});

usersRouter.post('/:id/reset-password', async (req, res) => {
  res.json(
    await resetPassword(currentUser(req), String(req.params.id), ['STUDENT', 'LECTURER', 'DEPT_ADMIN', 'SUPER_ADMIN'], clientIp(req)),
  );
});
