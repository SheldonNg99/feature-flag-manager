import { PrismaClient } from '@prisma/client';
import { getEnv } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let _prisma: PrismaClient | undefined;

function createPrismaClient(): PrismaClient {
  if (!_prisma) {
    const env = getEnv();
    _prisma = globalForPrisma.prisma ?? new PrismaClient({
      log: env.NODE_ENV === 'development'
        ? [{ level: 'query', emit: 'event' }, 'warn', 'error']
        : ['error'],
    });
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = _prisma;
    }
  }
  return _prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (createPrismaClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function connectDatabase(): Promise<void> {
  await createPrismaClient().$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await createPrismaClient().$disconnect();
}
