import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authService, type AuthenticatedUser } from '../../services/auth.service.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { getEnv } from '../../config/env.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const SKIP_PATHS = new Set(['/health', '/api/auth/login']);

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (SKIP_PATHS.has(req.path)) {
    return next();
  }

  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    authService.authenticateByKey(apiKeyHeader)
      .then((user) => {
        if (user) {
          req.user = user;
          next();
        } else {
          tryJwtAuth(req, next);
        }
      })
      .catch(() => tryJwtAuth(req, next));
    return;
  }

  tryJwtAuth(req, next);
}

function tryJwtAuth(req: Request, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    next(new UnauthorizedError());
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    next(new UnauthorizedError());
    return;
  }

  try {
    const env = getEnv();
    const payload = jwt.verify(parts[1], env.JWT_SECRET) as jwt.JwtPayload;
    if (!payload.sub) {
      next(new UnauthorizedError());
      return;
    }

    authService.getUserById(payload.sub)
      .then((user) => {
        req.user = user;
        next();
      })
      .catch(() => next(new UnauthorizedError()));
  } catch {
    next(new UnauthorizedError());
  }
}
