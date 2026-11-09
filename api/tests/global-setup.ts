import { execSync } from 'node:child_process';

/** Brings the test database schema up to date before any test file runs. */
export default function setup() {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
