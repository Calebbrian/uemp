import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { DEMO_PASSWORD, seed } from '../src/seed/demo-data';

export const app = createApp();

export const ACCOUNTS = {
  student: 'student@uemp.test',
  lecturer: 'lecturer@uemp.test',
  cscAdmin: 'csc.admin@uemp.test',
  mthAdmin: 'mth.admin@uemp.test',
  superAdmin: 'admin@uemp.test',
} as const;

export const resetDatabase = () => seed(prisma);

/** A supertest agent that keeps the session cookie and sends the CSRF header. */
export async function signIn(email: string, password = DEMO_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/login')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return wrap(agent);
}

export function wrap(agent: ReturnType<typeof request.agent>) {
  const withHeader = <T extends { set: (k: string, v: string) => T }>(r: T) => r.set('X-Requested-With', 'XMLHttpRequest');
  return {
    get: (url: string) => withHeader(agent.get(url)),
    post: (url: string, body: object = {}) => withHeader(agent.post(url)).send(body),
    put: (url: string, body: object = {}) => withHeader(agent.put(url)).send(body),
    patch: (url: string, body: object = {}) => withHeader(agent.patch(url)).send(body),
    delete: (url: string) => withHeader(agent.delete(url)),
  };
}

export type Client = Awaited<ReturnType<typeof signIn>>;

export async function offeringId(code: string) {
  const semester = await prisma.semester.findFirstOrThrow({ where: { isCurrent: true } });
  const offering = await prisma.courseOffering.findFirstOrThrow({ where: { semesterId: semester.id, course: { code } } });
  return offering.id;
}

export { prisma, request };
