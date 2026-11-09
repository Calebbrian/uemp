import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { audit, clientIp } from '../lib/audit';
import { unprocessable } from '../lib/errors';
import { validateBands } from '../lib/grading';
import { parse } from '../lib/validate';
import { currentUser, requirePermission } from '../middleware/auth';
import { getBands } from '../services/results';

export const gradingRouter = Router();

const bandSchema = z.object({
  grade: z.string().trim().toUpperCase().min(1).max(2),
  minScore: z.coerce.number().int().min(0).max(100),
  maxScore: z.coerce.number().int().min(0).max(100),
  point: z.coerce.number().min(0).max(10),
  remark: z.string().trim().min(1, 'Required').max(40),
});

/**
 * Replaces the whole scale. Results already saved keep the grade they were
 * given; the new scale applies the next time scores are entered.
 */
gradingRouter.put('/', requirePermission('grading.manage'), async (req, res) => {
  const user = currentUser(req);
  const body = parse(z.object({ bands: z.array(bandSchema).min(2).max(12) }), req.body);
  const problem = validateBands(body.bands);
  if (problem) throw unprocessable(problem);

  const before = await getBands();
  await prisma.$transaction(async (tx) => {
    await tx.gradeBand.deleteMany();
    await tx.gradeBand.createMany({ data: body.bands });
    await audit(tx, {
      actor: user,
      action: 'GRADING_SCALE_UPDATED',
      entityType: 'GradeBand',
      summary: `Grading scale updated (${body.bands.map((b) => `${b.grade} ${b.minScore}–${b.maxScore}`).join(', ')})`,
      metadata: { before: before.map(({ grade, minScore, maxScore, point, remark }) => ({ grade, minScore, maxScore, point, remark })), after: body.bands },
      ip: clientIp(req),
    });
  });
  res.json({ bands: await getBands() });
});
