import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../src/lib/prisma.js';
import {
  createTestUser,
  createTestCustomer,
  createTestFeature,
  createTestAssignment,
  createTestApiKey,
} from '../../fixtures/seed.js';

const createdUserIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdFeatureIds: string[] = [];

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.apiKey.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  for (const customerId of createdCustomerIds) {
    await prisma.customer.deleteMany({ where: { id: customerId } });
  }
  for (const featureId of createdFeatureIds) {
    await prisma.feature.deleteMany({ where: { id: featureId } });
  }
  await prisma.$disconnect();
});

describe('Schema sanity check', () => {
  it('should seed and read back Customer + Feature + Assignment', async () => {
    const customer = await createTestCustomer(prisma, { name: 'Acme Corp' });
    createdCustomerIds.push(customer.id);
    const feature = await createTestFeature(prisma, { key: 'advanced-analytics', name: 'Advanced Analytics' });
    createdFeatureIds.push(feature.id);
    const assignment = await createTestAssignment(prisma, customer.id, feature.id, { enabled: true });

    const found = await prisma.assignment.findUnique({
      where: { customerId_featureId: { customerId: customer.id, featureId: feature.id } },
      include: { customer: true, feature: true },
    });

    expect(found).not.toBeNull();
    expect(found!.enabled).toBe(true);
    expect(found!.customer.name).toBe('Acme Corp');
    expect(found!.feature.key).toBe('advanced-analytics');

    const customerFeatures = await prisma.assignment.findMany({
      where: { customerId: customer.id },
      include: { feature: true },
    });
    expect(customerFeatures).toHaveLength(1);
    expect(customerFeatures[0].feature.key).toBe('advanced-analytics');

    const featureCustomers = await prisma.assignment.findMany({
      where: { featureId: feature.id, enabled: true },
      include: { customer: true },
    });
    expect(featureCustomers).toHaveLength(1);
    expect(featureCustomers[0].customer.name).toBe('Acme Corp');
  });

  it('should enforce unique constraint on customerId + featureId', async () => {
    const customer = await createTestCustomer(prisma);
    createdCustomerIds.push(customer.id);
    const feature = await createTestFeature(prisma);
    createdFeatureIds.push(feature.id);
    await createTestAssignment(prisma, customer.id, feature.id);

    await expect(
      createTestAssignment(prisma, customer.id, feature.id),
    ).rejects.toThrow();
  });

  it('should cascade delete assignments when customer is deleted', async () => {
    const customer = await createTestCustomer(prisma);
    const feature = await createTestFeature(prisma);
    createdFeatureIds.push(feature.id);
    await createTestAssignment(prisma, customer.id, feature.id);

    await prisma.customer.delete({ where: { id: customer.id } });

    const remaining = await prisma.assignment.findMany({
      where: { customerId: customer.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('should create and query API keys for a user', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const key1 = await createTestApiKey(prisma, user.id, { label: 'CI/CD pipeline' });
    const key2 = await createTestApiKey(prisma, user.id, { label: 'GitHub Actions' });

    const keys = await prisma.apiKey.findMany({
      where: { userId: user.id, revokedAt: null },
    });
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.label).sort()).toEqual(['CI/CD pipeline', 'GitHub Actions']);

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
    const u1 = await createTestUser(prisma, { email: 'unique@test.com' });
    createdUserIds.push(u1.id);
    await expect(
      createTestUser(prisma, { email: 'unique@test.com' }),
    ).rejects.toThrow();
  });

  it('should enforce unique key on features', async () => {
    const f = await createTestFeature(prisma, { key: 'beta-feature' });
    createdFeatureIds.push(f.id);
    await expect(
      createTestFeature(prisma, { key: 'beta-feature' }),
    ).rejects.toThrow();
  });
});
