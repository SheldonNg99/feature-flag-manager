import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createTestApp } from '../../helpers/app.js';
import { prisma } from '../../../src/lib/prisma.js';

const app = createTestApp();

const API_USER_EMAIL = `apikey-test-${Date.now().toString(36)}@example.com`;
const API_USER_PASSWORD = 'apikey-password-123';
const API_KEY_RAW = `ffm-test-key-${Date.now().toString(36)}`;
let apiKeyHash: string;
let userId: string;

beforeAll(async () => {
  apiKeyHash = await bcrypt.hash(API_KEY_RAW, 4);

  const existing = await prisma.user.findUnique({ where: { email: API_USER_EMAIL } });
  if (existing) {
    userId = existing.id;
  } else {
    const user = await prisma.user.create({
      data: {
        email: API_USER_EMAIL,
        passwordHash: await bcrypt.hash(API_USER_PASSWORD, 4),
        name: 'API Key Test User',
        role: 'SRE',
      },
    });
    userId = user.id;
  }

  const existingKey = await prisma.apiKey.findFirst({ where: { userId } });
  if (!existingKey) {
    await prisma.apiKey.create({
      data: {
        userId,
        hash: apiKeyHash,
        label: 'Test API Key',
        expiresAt: null,
        revokedAt: null,
      },
    });
  }
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.apiKey.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe('API Key authentication', () => {
  it('authenticates with valid API key via X-API-Key header', async () => {
    const res = await request(app)
      .get('/api/protected')
      .set('X-API-Key', API_KEY_RAW);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(API_USER_EMAIL);
    expect(res.body.user.role).toBe('SRE');
  });

  it('updates lastUsedAt on successful auth', async () => {
    await request(app)
      .get('/api/protected')
      .set('X-API-Key', API_KEY_RAW);

    const key = await prisma.apiKey.findFirst({ where: { userId } });
    expect(key!.lastUsedAt).not.toBeNull();
  });

  it('rejects invalid API key', async () => {
    const res = await request(app)
      .get('/api/protected')
      .set('X-API-Key', 'completely-wrong-key');

    expect(res.status).toBe(401);
  });

  it('rejects revoked API key', async () => {
    const key = await prisma.apiKey.findFirst({ where: { userId } });

    await prisma.apiKey.update({
      where: { id: key!.id },
      data: { revokedAt: new Date() },
    });

    const res = await request(app)
      .get('/api/protected')
      .set('X-API-Key', API_KEY_RAW);

    expect(res.status).toBe(401);

    // Restore for subsequent tests
    await prisma.apiKey.update({
      where: { id: key!.id },
      data: { revokedAt: null },
    });
  });

  it('rejects expired API key', async () => {
    const key = await prisma.apiKey.findFirst({ where: { userId } });

    await prisma.apiKey.update({
      where: { id: key!.id },
      data: { expiresAt: new Date('2020-01-01') },
    });

    const res = await request(app)
      .get('/api/protected')
      .set('X-API-Key', API_KEY_RAW);

    expect(res.status).toBe(401);

    // Restore for subsequent tests
    await prisma.apiKey.update({
      where: { id: key!.id },
      data: { expiresAt: null },
    });
  });

  it('falls back to JWT when API key is invalid', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: API_USER_EMAIL, password: API_USER_PASSWORD });

    expect(loginRes.status).toBe(200);

    const res = await request(app)
      .get('/api/protected')
      .set('X-API-Key', 'invalid-key')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(API_USER_EMAIL);
  });

  it('authenticates with multiple active keys', async () => {
    const secondKeyRaw = `ffm-second-key-${Date.now().toString(36)}`;
    const secondKeyHash = await bcrypt.hash(secondKeyRaw, 4);

    const secondKey = await prisma.apiKey.create({
      data: {
        userId,
        hash: secondKeyHash,
        label: 'Second Key',
      },
    });

    const res1 = await request(app)
      .get('/api/protected')
      .set('X-API-Key', API_KEY_RAW);
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .get('/api/protected')
      .set('X-API-Key', secondKeyRaw);
    expect(res2.status).toBe(200);

    // Cleanup
    await prisma.apiKey.delete({ where: { id: secondKey.id } });
  });
});
