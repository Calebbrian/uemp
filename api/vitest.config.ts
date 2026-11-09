import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile('../.env');
} catch {
  // CI provides the variables directly.
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('Set TEST_DATABASE_URL to a database the test suite may wipe.');

export default defineConfig({
  test: {
    env: { DATABASE_URL: testDatabaseUrl, NODE_ENV: 'test' },
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
