import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../../lib/errors.js';

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError();
    }
    next();
  };
}
