export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Please sign in to continue.') =>
  new HttpError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = "You don't have permission to do that.") =>
  new HttpError(403, 'FORBIDDEN', message);

export const notFound = (what = 'Record') => new HttpError(404, 'NOT_FOUND', `${what} not found.`);

export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, 'CONFLICT', message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new HttpError(422, 'UNPROCESSABLE', message, details);
