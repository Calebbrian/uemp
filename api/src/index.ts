import { createApp } from './app';
import { config } from './config';
import { prisma } from './db';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`UEMP API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Expired sessions are also rejected on read; this just keeps the table small.
setInterval(
  () => {
    prisma.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(console.error);
  },
  60 * 60 * 1000,
).unref();
