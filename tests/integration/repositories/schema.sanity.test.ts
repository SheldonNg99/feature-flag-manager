import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createTestUser,
  createTestCustomer,
  createTestFeature,
  createTestAssignment,
  createTestApiKey,
} from '../../fixtures/seed.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  // Clean up in reverse dependency order
  await prisma.auditLog.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.feature.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('Schema sanity check', () => {
  it('should seed and read back Customer + Feature + Assignment', async () => {
    const customer = await createTestCustomer(prisma, { name: 'Acme Corp' });
    const feature = await createTestFeature(prisma, { key: 'advanced-analytics', name: 'Advanced Analytics' });
    const assignment = await createTestAssignment(prisma, customer.id, feature.id, { enabled: true });

    // Read back via relation
    const found = await prisma.assignment.findUnique({
      where: { customerId_featureId: { customerId: customer.id, featureId: feature.id } },
      include: { customer: true, feature: true },
    });

    expect(found).not.toBeNull();
    expect(found!.enabled).toBe(true);
    expect(found!.customer.name).toBe('Acme Corp');
    expect(found!.feature.key).toBe('advanced-analytics');

    // Query features for customer
    const customerFeatures = await prisma.assignment.findMany({
      where: { customerId: customer.id },
      include: { feature: true },
    });
    expect(customerFeatures).toHaveLength(1);
    expect(customerFeatures[0].feature.key).toBe('advanced-analytics');

    // Query customers for feature
    const featureCustomers = await prisma.assignment.findMany({
      where: { featureId: feature.id, enabled: true },
      include: { customer: true },
    });
    expect(featureCustomers).toHaveLength(1);
    expect(featureCustomers[0].customer.name).toBe('Acme Corp');
  });

  it('should enforce unique constraint on customerId + featureId', async () => {
    const customer = await createTestCustomer(prisma);
    const feature = await createTestFeature(prisma);
    await createTestAssignment(prisma, customer.id, feature.id);

    await expect(
      createTestAssignment(prisma, customer.id, feature.id),
    ).rejects.toThrow();
  });

  it('should cascade delete assignments when customer is deleted', async () => {
    const customer = await createTestCustomer(prisma);
    const feature = await createTestFeature(prisma);
    await createTestAssignment(prisma, customer.id, feature.id);

    await prisma.customer.delete({ where: { id: customer.id } });

    const remaining = await prisma.assignment.findMany({
      where: { customerId: customer.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('should create and query API keys for a user', async () => {
    const user = await createTestUser(prisma);
    const key1 = await createTestApiKey(prisma, user.id, { label: 'CI/CD pipeline' });
    const key2 = await createTestApiKey(prisma, user.id, { label: 'GitHub Actions' });

    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id, revokedAt: null },
    });
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.label).sort()).toEqual(['CI/CD pipeline', 'GitHub Actions']);

    // Revoke one
    await prisma.apiKey.update({
      where: { id: key1.id },
      data: { revokedAt: new Date() },
    });

    const activeKeys = await prisma.apiKey.findMany({
      where: { userId: user.id, revokedAt: null },
    });
    expect(activeKeys).toHaveLength(1);
    expect(activeKeys[0].label).toBe('GitHub Actions');
  });

  it('should enforce unique email on users', async () => {
    await createTestUser(prisma, { email: 'unique@test.com' });
    await expect(
      createTestUser(prisma, { email: 'unique@test.com' }),
    ).rejects.toThrow();
  });

  it('should enforce unique key on features', async () => {
    await createTestFeature(prisma, { key: 'beta-feature' });
    await expect(
      createTestFeature(prisma, { key: 'beta-feature' }),
    ).rejects.toThrow();
  });
});
