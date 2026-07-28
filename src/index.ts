import express from 'express';
import cors from 'cors';
import { loadEnv, getEnv } from './config/env.js';
import { getLogger } from './lib/logger.js';
import { connectDatabase } from './lib/prisma.js';
import { authMiddleware } from './api/middleware/auth.js';
import { errorHandler } from './api/middleware/error-handler.js';
import { validate } from './api/middleware/validate.js';
import { handleLogin, createLoginLimiter, handleMe } from './api/routes/auth.js';
import { LoginSchema } from './api/schemas/auth.js';

loadEnv();
const env = getEnv();
const app: express.Express = express();
const logger = getLogger();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', createLoginLimiter(), validate(LoginSchema), handleLogin);

app.use(authMiddleware);

app.get('/api/auth/me', ...handleMe);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
});

app.use(errorHandler);

async function start(): Promise<void> {
  await connectDatabase();
  logger.info('Database connected');

  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
  });
}

start().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});

export { app };
