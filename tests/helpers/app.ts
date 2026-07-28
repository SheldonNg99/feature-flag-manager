import express from 'express';
import { authMiddleware } from '../../src/api/middleware/auth.js';
import { errorHandler } from '../../src/api/middleware/error-handler.js';
import { validate } from '../../src/api/middleware/validate.js';
import { handleLogin, createLoginLimiter, handleMe } from '../../src/api/routes/auth.js';
import { LoginSchema } from '../../src/api/schemas/auth.js';

export function createTestApp(): express.Express {
  const app: express.Express = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/login', validate(LoginSchema), handleLogin);

  app.use(authMiddleware);

  app.get('/api/auth/me', ...handleMe);

  app.get('/api/protected', (_req, res) => {
    res.json({ user: _req.user });
  });

  app.use(errorHandler);

  return app;
}

export function createTestAppWithRateLimit(): express.Express {
  const app: express.Express = express();
  app.use(express.json());

  app.post('/api/auth/login', createLoginLimiter(), validate(LoginSchema), handleLogin);

  app.use(authMiddleware);

  app.use(errorHandler);

  return app;
}
