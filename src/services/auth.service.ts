import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { InvalidCredentialsError, UnauthorizedError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface JwtPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

export class AuthService {
  async login(email: string, password: string): Promise<{ token: string; user: AuthenticatedUser }> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    const env = getEnv();
    const token = jwt.sign(
      { sub: user.id, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] },
    );

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async getUserById(id: string): Promise<AuthenticatedUser> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async authenticateByKey(rawKey: string): Promise<AuthenticatedUser | null> {
    let keys;
    try {
      keys = await prisma.apiKey.findMany({
        where: { revokedAt: null },
        include: { user: true },
      });
    } catch {
      return null;
    }

    for (const key of keys) {
      if (!key.user) continue;
      if (key.expiresAt && key.expiresAt < new Date()) {
        continue;
      }

      const matches = await bcrypt.compare(rawKey, key.hash);
      if (matches) {
        prisma.apiKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date() },
        }).catch(() => {});

        return {
          id: key.user.id,
          email: key.user.email,
          name: key.user.name,
          role: key.user.role,
        };
      }
    }

    return null;
  }

  async hashPassword(password: string): Promise<string> {
    const env = getEnv();
    return bcrypt.hash(password, env.API_KEY_SALT_ROUNDS);
  }
}

export const authService = new AuthService();
