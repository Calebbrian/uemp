import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Prisma } from '@prisma/client';
import { config } from './config';
import { HttpError } from './lib/errors';
import { authenticate } from './middleware/auth';
import { apiRouter } from './routes';

const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

/**
 * Requests that change state must carry this header. Browsers will not add a
 * custom header to a cross-site form post, so together with SameSite=Lax
 * cookies this blocks CSRF without needing tokens.
 */
function requireAjaxHeader(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    res.status(403).json({ error: { code: 'CSRF', message: 'Request blocked.' } });
    return;
  }
  next();
}

const FIELD_LABELS: Record<string, string> = {
  email: 'email',
  matricNo: 'matric number',
  staffId: 'staff ID',
  code: 'code',
  name: 'name',
};

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      const label = target.filter((f) => f !== 'departmentId').map((f) => FIELD_LABELS[f] ?? f).join(' and ') || 'value';
      res.status(409).json({
        error: { code: 'DUPLICATE', message: `A record with this ${label} already exists.`, details: { target: target.join(', ') } },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({
        error: { code: 'IN_USE', message: 'This record is still linked to other records and cannot be removed.' },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
      return;
    }
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
}

export function createApp() {
  const app = express();
  if (config.isProd) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { 'img-src': ["'self'", 'data:'], 'upgrade-insecure-requests': config.isProd ? [] : null },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', requireAjaxHeader, authenticate, apiRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
  });

  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile('index.html', { root: WEB_DIST });
    });
  }

  app.use(errorHandler);
  return app;
}
