import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createTestApp, createTestAppWithRateLimit } from '../../helpers/app.js';
import { prisma } from '../../../src/lib/prisma.js';

const app = createTestApp();

const VIEWER_EMAIL = `rbac-viewer-${Date.now().toString(36)}@example.com`;
const SRE_EMAIL = `rbac-sre-${Date.now().toString(36)}@example.com`;
const PASSWORD = 'password123';
let viewerToken: string;
let sreToken: string;

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 4);

  const viewer = await prisma.user.upsert({
    where: { email: VIEWER_EMAIL },
    update: {},
    create: { email: VIEWER_EMAIL, passwordHash: hash, name: 'Viewer', role: 'VIEWER' },
  });
  const sre = await prisma.user.upsert({
    where: { email: SRE_EMAIL },
    update: {},
    create: { email: SRE_EMAIL, passwordHash: hash, name: 'SRE', role: 'SRE' },
  });

  const loginViewer = await request(app)
    .post('/api/auth/login')
    .send({ email: VIEWER_EMAIL, password: PASSWORD });
  viewerToken = loginViewer.body.token;

  const loginSre = await request(app)
    .post('/api/auth/login')
    .send({ email: SRE_EMAIL, password: PASSWORD });
  sreToken = loginSre.body.token;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { user: { email: { in: [VIEWER_EMAIL, SRE_EMAIL] } } } });
  await prisma.user.deleteMany({ where: { email: { in: [VIEWER_EMAIL, SRE_EMAIL] } } });
});

describe('POST /api/auth/login rate limiting', () => {
  it('returns 429 after 5 failed attempts from same IP', async () => {
    const rlApp = createTestAppWithRateLimit();

    for (let i = 0; i < 5; i++) {
      await request(rlApp)
        .post('/api/auth/login')
        .send({ email: 'ratelimit-test@test.com', password: 'wrong' });
    }

    const res = await request(rlApp)
      .post('/api/auth/login')
      .send({ email: 'ratelimit-test@test.com', password: 'wrong' });

    expect(res.status).toBe(429);
  });
});

describe('RBAC enforcement', () => {
  it('VIEWER can access /api/auth/me', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('VIEWER');
  });

  it('SRE can access /api/auth/me', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sreToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('SRE');
  });
});
