import { PrismaClient } from '@prisma/client';
import { getEnv } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const env = getEnv();
  return new PrismaClient({
    log: env.NODE_ENV === 'development'
      ? [{ level: 'query', emit: 'event' }, 'warn', 'error']
      : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
