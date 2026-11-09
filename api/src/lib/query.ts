import type { Request } from 'express';

export const csvRequested = (req: Request) => req.query.format === 'csv';
