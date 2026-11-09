import { z } from 'zod';
import { HttpError } from './errors';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.map(String).join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new HttpError(400, 'VALIDATION_FAILED', 'Some fields need attention.', { fields });
  }
  return result.data;
}

export const id = z.string().trim().min(1, 'Required');

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const personName = z.string().trim().min(1, 'Required').max(60, 'Use 60 characters or fewer');

export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(100)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const level = z.coerce
  .number()
  .int()
  .refine((n) => [100, 200, 300, 400, 500, 600].includes(n), 'Choose a valid level');

export const term = z.enum(['FIRST', 'SECOND']);

export const matricNo = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,4}\/\d{4}\/\d{3,4}$/, 'Use the format CSC/2025/014');

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/** Empty query-string values ("?level=") are treated as absent. */
export const optionalQuery = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export function pageArgs({ page, pageSize }: { page: number; pageSize: number }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
