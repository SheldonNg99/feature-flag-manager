import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { authService } from '../../services/auth.service.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/rbac.js';
import { LoginSchema } from '../schemas/auth.js';

export function createLoginLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in a minute.' } },
  });
}

export async function handleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export const handleMe = [
  requireRole('ADMIN', 'SUPPORT_ENGINEER', 'SRE', 'VIEWER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await authService.getUserById(req.user!.id);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },
];
