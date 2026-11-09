import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { AUDIT_ACTIONS } from '../lib/audit';
import { fullName } from '../lib/academic';
import { sendCsv } from '../lib/csv';
import { csvRequested } from '../lib/query';
import { departmentFilter } from '../lib/scope';
import { id, optionalQuery, pageArgs, pagination, parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';

export const auditRouter = Router();
auditRouter.use(requirePermission('audit.view'));

const listQuery = pagination.extend({
  action: optionalQuery(z.string().trim().max(60)),
  actorId: optionalQuery(id),
  departmentId: optionalQuery(id),
  entityType: optionalQuery(z.string().trim().max(60)),
  entityId: optionalQuery(id),
  from: optionalQuery(z.iso.date()),
  to: optionalQuery(z.iso.date()),
  q: optionalQuery(z.string().trim().max(100)),
});

auditRouter.get('/actions', (_req, res) => {
  res.json({ items: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })) });
});

auditRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const q = parse(listQuery, req.query);
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : undefined;
  const where: Prisma.AuditLogWhereInput = {
    departmentId: departmentFilter(user, q.departmentId),
    action: q.action,
    actorId: q.actorId,
    entityType: q.entityType,
    entityId: q.entityId,
    createdAt: q.from || to ? { gte: q.from ? new Date(q.from) : undefined, lte: to } : undefined,
    ...(q.q ? { summary: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const include = { actor: true, department: true } satisfies Prisma.AuditLogInclude;
  const format = (e: Prisma.AuditLogGetPayload<{ include: typeof include }>) => ({
    id: e.id,
    action: e.action,
    label: AUDIT_ACTIONS[e.action as keyof typeof AUDIT_ACTIONS] ?? e.action,
    actor: e.actor ? { id: e.actor.id, name: fullName(e.actor), email: e.actor.email } : null,
    actorRole: e.actorRole,
    entityType: e.entityType,
    entityId: e.entityId,
    department: e.department ? { id: e.department.id, code: e.department.code } : null,
    summary: e.summary,
    metadata: e.metadata,
    ipAddress: e.ipAddress,
    createdAt: e.createdAt,
  });

  if (csvRequested(req)) {
    const rows = await prisma.auditLog.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 5000 });
    sendCsv(
      res,
      'audit-log.csv',
      ['Time', 'Actor', 'Role', 'Action', 'Summary', 'Department', 'IP'],
      rows.map(format).map((e) => [e.createdAt.toISOString(), e.actor?.name ?? 'System', e.actorRole, e.label, e.summary, e.department?.code, e.ipAddress]),
    );
    return;
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items: items.map(format), total, page: q.page, pageSize: q.pageSize });
});
