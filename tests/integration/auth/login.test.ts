import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../../helpers/app.js';
import { getEnv } from '../../../src/config/env.js';
import { prisma } from '../../../src/lib/prisma.js';

const app = createTestApp();

const ADMIN_EMAIL = 'login-test@example.com';
const ADMIN_PASSWORD = 'test-password-123';

beforeAll(async () => {
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
      name: 'Login Test User',
      role: 'ADMIN',
    },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { user: { email: ADMIN_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
});

describe('POST /api/auth/login', () => {
  it('returns token and user on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: ADMIN_EMAIL,
      name: 'Login Test User',
      role: 'ADMIN',
    });
  });

  it('token is a valid JWT', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    const env = getEnv();
    const decoded = jwt.verify(res.body.token, env.JWT_SECRET) as jwt.JwtPayload;

    expect(decoded.sub).toBe(res.body.user.id);
    expect(decoded.role).toBe('ADMIN');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 400 on missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password' });

    expect(res.status).toBe(400);
  });

  it('returns 400 on missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns current user with valid token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(loginRes.status).toBe(200);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: ADMIN_EMAIL,
      name: 'Login Test User',
      role: 'ADMIN',
    });
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });

  it('returns 401 with expired token', async () => {
    const env = getEnv();
    const token = jwt.sign(
      { sub: 'nonexistent', role: 'ADMIN' },
      env.JWT_SECRET,
      { expiresIn: '0s' },
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

describe('Protected routes', () => {
  it('GET /api/protected returns 401 without token', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
  });

  it('GET /api/protected returns user with valid token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(loginRes.status).toBe(200);

    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(ADMIN_EMAIL);
  });
});

describe('Health endpoint', () => {
  it('GET /health returns ok without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
