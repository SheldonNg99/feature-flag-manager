import { PrismaClient, Role } from '@prisma/client';

let counter = 0;

function uniq(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}-${Date.now().toString(36)}`;
}

export async function createTestUser(
  prisma: PrismaClient,
  overrides: { email?: string; name?: string; role?: Role; passwordHash?: string } = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? uniq('user') + '@test.example.com',
      passwordHash: overrides.passwordHash ?? 'placeholder-hash',
      name: overrides.name ?? uniq('User'),
      role: overrides.role ?? Role.VIEWER,
    },
  });
}

export async function createTestCustomer(
  prisma: PrismaClient,
  overrides: { name?: string; externalId?: string; description?: string } = {},
) {
  return prisma.customer.create({
    data: {
      name: overrides.name ?? uniq('Customer'),
      externalId: overrides.externalId ?? uniq('ext'),
      description: overrides.description ?? 'Test customer',
    },
  });
}

export async function createTestFeature(
  prisma: PrismaClient,
  overrides: { key?: string; name?: string; enabled?: boolean } = {},
) {
  return prisma.feature.create({
    data: {
      key: overrides.key ?? uniq('feature'),
      name: overrides.name ?? uniq('Feature'),
      enabled: overrides.enabled ?? false,
    },
  });
}

export async function createTestAssignment(
  prisma: PrismaClient,
  customerId: string,
  featureId: string,
  overrides: { enabled?: boolean } = {},
) {
  return prisma.assignment.create({
    data: {
      customerId,
      featureId,
      enabled: overrides.enabled ?? true,
    },
  });
}

export async function createTestApiKey(
  prisma: PrismaClient,
  userId: string,
  overrides: { hash?: string; label?: string; expiresAt?: Date | null; revokedAt?: Date | null } = {},
) {
  return prisma.apiKey.create({
    data: {
      userId,
      hash: overrides.hash ?? uniq('hash'),
      label: overrides.label ?? uniq('key'),
      expiresAt: overrides.expiresAt ?? null,
      revokedAt: overrides.revokedAt ?? null,
    },
  });
}

export async function createTestAuditLog(
  prisma: PrismaClient,
  overrides: {
    action?: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  } = {},
) {
  return prisma.auditLog.create({
    data: {
      action: overrides.action ?? 'CREATE',
      entityType: overrides.entityType ?? 'FEATURE',
      entityId: overrides.entityId ?? uniq('entity'),
      userId: overrides.userId ?? null,
      details: overrides.details ?? {},
      ipAddress: overrides.ipAddress ?? null,
    },
  });
}
