import { PrismaClient } from '@prisma/client';
import { DEMO_PASSWORD, seed } from '../src/seed/demo-data';

const prisma = new PrismaClient();

try {
  console.log('Seeding demo data…');
  await seed(prisma, (m) => console.log(`  ${m}`));
  console.log(`Done. Demo accounts use the password ${DEMO_PASSWORD}`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
