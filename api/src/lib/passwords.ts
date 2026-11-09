import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * Compared against when the email does not exist, so a failed login takes the
 * same time whether or not the account is real.
 */
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

/** Readable one-time password shown to the admin once, e.g. "Kqtr-4821". */
export function temporaryPassword(): string {
  let word = '';
  for (let i = 0; i < 4; i++) word += LETTERS[randomInt(LETTERS.length)];
  return `${word}-${randomInt(1000, 10000)}`;
}
