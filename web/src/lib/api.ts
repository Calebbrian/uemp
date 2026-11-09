export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: { fields?: Record<string, string>; courses?: string[]; missing?: string[] } & Record<string, unknown>,
  ) {
    super(message);
  }

  get fields(): Record<string, string> {
    return this.details?.fields ?? {};
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function toQuery(params?: Query): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const UNAUTHORIZED_EVENT = 'uemp:unauthorized';

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}${toQuery(query)}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Check your connection and try again.', 0, 'NETWORK');
  }

  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const error = data?.error ?? {};
    throw new ApiError(error.message ?? 'Something went wrong.', res.status, error.code ?? 'UNKNOWN', error.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** CSV exports are plain GET downloads; the session cookie authenticates them. */
export function downloadCsv(path: string, query?: Query) {
  const link = document.createElement('a');
  link.href = `/api${path}${toQuery({ ...query, format: 'csv' })}`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');
